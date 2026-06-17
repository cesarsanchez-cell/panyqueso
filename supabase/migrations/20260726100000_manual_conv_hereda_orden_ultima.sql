-- ============================================================================
-- Mejora: la creación manual de convocatoria hereda el orden de la última
-- ============================================================================
--
-- create_convocatoria_from_grupo (botón "Crear convocatoria" del grupo) armaba
-- el roster SIEMPRE desde grupo_membresias en orden de alta (joined_at). Eso
-- reordenaba a la gente cada vez: si el grupo ya venía con un orden propio
-- (titulares/suplentes y lista de espera), la creación manual lo perdía.
--
-- Cambio: si el grupo YA tuvo una convocatoria previa (la última no cancelada,
-- con roster), heredamos su orden EXACTO (titulares/suplentes + orden_suplente)
-- igual que la auto-renovación (create_next_convocatoria), y llenamos cupos de
-- titular vacíos con los primeros suplentes. Si es la PRIMERA del grupo, caemos
-- al orden natural de alta (joined_at), como antes.
--
-- Así "abrir manual" reproduce lo que habría hecho la auto-renovación, en vez
-- de barajar de nuevo. Mismo criterio que el worker de renovación → consistente.
-- ============================================================================

create or replace function public.create_convocatoria_from_grupo(
  p_grupo_id uuid,
  p_fecha date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grupo         public.grupos%rowtype;
  v_partido_at    timestamptz;
  v_fecha         date;
  v_cierre_at     timestamptz;
  v_new_conv_id   uuid;
  v_existing_id   uuid;
  v_source_conv_id uuid;
begin
  select * into v_grupo from public.grupos where id = p_grupo_id;
  if not found then
    raise exception 'grupo_not_found' using errcode = 'P0050';
  end if;
  if v_grupo.status <> 'activo' then
    raise exception 'grupo_not_active' using errcode = 'P0051';
  end if;

  -- Fecha: si no la dan, calculamos la proxima ocurrencia del dia_semana.
  if p_fecha is null then
    v_partido_at := public._next_partido_at(v_grupo.dia_semana, v_grupo.hora);
    v_fecha := v_partido_at::date;
  else
    v_fecha := p_fecha;
    v_partido_at := (v_fecha + v_grupo.hora)::timestamptz;
  end if;

  if v_fecha < current_date then
    raise exception 'fecha_anterior_a_hoy'
      using errcode = 'P0058', detail = v_fecha::text;
  end if;

  -- Unicidad: un grupo no puede tener dos convs no canceladas en la misma fecha.
  select id into v_existing_id
    from public.convocatorias
   where grupo_id = p_grupo_id
     and fecha = v_fecha
     and status <> 'cancelada'
   limit 1;
  if found then
    raise exception 'open_convocatoria_already_exists'
      using errcode = 'P0052', detail = v_existing_id::text;
  end if;

  v_cierre_at := v_partido_at + (v_grupo.cierre_minutes_after_start || ' minutes')::interval;

  insert into public.convocatorias (
    fecha, hora, lugar_id, cupo_maximo, status, modo, grupo_id, cierre_at, created_by
  )
  values (
    v_fecha,
    v_grupo.hora,
    v_grupo.lugar_id,
    v_grupo.cupo_titulares,
    'abierta',
    'cerrada',
    p_grupo_id,
    v_cierre_at,
    v_grupo.owner_id
  )
  returning id into v_new_conv_id;

  -- ¿Hay una convocatoria previa del grupo con roster? Tomamos la última no
  -- cancelada anterior a la fecha nueva. Si la hay, heredamos su orden.
  select c.id into v_source_conv_id
    from public.convocatorias c
   where c.grupo_id = p_grupo_id
     and c.id <> v_new_conv_id
     and c.fecha < v_fecha
     and c.status <> 'cancelada'
     and exists (
       select 1 from public.convocatoria_players cp
        where cp.convocatoria_id = c.id
          and cp.player_id is not null
     )
   order by c.fecha desc, c.created_at desc
   limit 1;

  if v_source_conv_id is not null then
    -- Heredar el roster EXACTO de la última (no-declinados), igual que la
    -- auto-renovación: mismos titulares/suplentes y orden_suplente.
    insert into public.convocatoria_players (
      convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
    )
    select v_new_conv_id,
           cp.player_id,
           'confirmado',
           cp.rol_en_convocatoria,
           cp.orden_suplente
      from public.convocatoria_players cp
     where cp.convocatoria_id = v_source_conv_id
       and cp.attendance_status <> 'declinado'
       and cp.player_id is not null
     on conflict (convocatoria_id, player_id) do nothing;

    -- Llenar cupos de titular vacios con los primeros suplentes activos.
    declare
      v_titulares_count int;
      v_faltan int;
      v_supl_id uuid;
    begin
      select count(*) into v_titulares_count
        from public.convocatoria_players
       where convocatoria_id = v_new_conv_id
         and rol_en_convocatoria = 'titular'
         and attendance_status <> 'declinado';
      v_faltan := v_grupo.cupo_titulares - v_titulares_count;
      while v_faltan > 0 loop
        select id into v_supl_id
          from public.convocatoria_players
         where convocatoria_id = v_new_conv_id
           and rol_en_convocatoria = 'suplente'
           and attendance_status <> 'declinado'
         order by orden_suplente asc
         limit 1;
        exit when not found;
        update public.convocatoria_players
           set rol_en_convocatoria = 'titular',
               orden_suplente = null,
               updated_at = now()
         where id = v_supl_id;
        perform public._conv_compactar_cola(v_new_conv_id, 1);
        v_faltan := v_faltan - 1;
      end loop;
    end;
  else
    -- Primera convocatoria del grupo: orden natural de alta (joined_at).
    -- Primeros N titulares, resto suplentes con orden_suplente 1..M.
    with miembros as (
      select gm.player_id,
             row_number() over (order by gm.joined_at asc, gm.id asc) as pos
        from public.grupo_membresias gm
       where gm.grupo_id = p_grupo_id
         and gm.status = 'activo'
    )
    insert into public.convocatoria_players (
      convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
    )
    select v_new_conv_id,
           m.player_id,
           'confirmado',
           case when m.pos <= v_grupo.cupo_titulares then 'titular' else 'suplente' end::public.membresia_tipo,
           case when m.pos <= v_grupo.cupo_titulares then null else (m.pos - v_grupo.cupo_titulares)::int end
      from miembros m
     on conflict (convocatoria_id, player_id) do nothing;
  end if;

  return v_new_conv_id;
end;
$$;

comment on function public.create_convocatoria_from_grupo(uuid, date) is
  'Crea una convocatoria para un grupo en la fecha indicada (o proxima ocurrencia del dia_semana si NULL). Hereda lugar/hora/cupo del grupo. Roster: si el grupo ya tuvo una convocatoria previa, hereda su orden exacto (titulares/suplentes + orden_suplente) como la auto-renovación; si es la primera, usa el orden de alta (joined_at), titulares primero y resto suplentes FIFO.';
