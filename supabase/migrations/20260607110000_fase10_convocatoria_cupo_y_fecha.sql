-- ============================================================================
-- Fase 10: (1) auto-renovacion snapea al dia del grupo  (2) editar cupo de una
--          convocatoria abierta reacomodando el roster
-- ============================================================================
--
-- (1) FECHA: create_next_convocatoria calculaba la fecha de la siguiente como
--     "fecha anterior + 7". Si la conv origen caia FUERA del dia habitual del
--     grupo (fecha cargada a mano), ese desfase se arrastraba para siempre.
--     Ahora snapea a la PROXIMA ocurrencia de grupos.dia_semana estrictamente
--     posterior a la fecha origen: si la origen ya estaba en el dia del grupo,
--     da +7 (igual que antes); si estaba corrida, vuelve al dia del grupo.
--
-- (2) CUPO: set_convocatoria_cupo permite al admin cambiar la cantidad de
--     titulares de una convocatoria ABIERTA antes de cerrarla (el ideal del
--     grupo puede no alcanzarse o sobrar; queda en manos del admin). Al cambiar
--     el cupo, se re-divide el roster no-declinado por un orden unificado
--     (titulares primero por antiguedad, luego suplentes por su orden de cola):
--     los primeros N quedan titulares, el resto suplentes 1..M. Subir el cupo
--     promueve suplentes; bajarlo manda los ultimos titulares al frente de la
--     cola.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) create_next_convocatoria: snap al dia del grupo (resto identico al
--     comportamiento de 20260606100000).
-- ----------------------------------------------------------------------------
create or replace function public.create_next_convocatoria(
  p_source_conv_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv          public.convocatorias%rowtype;
  v_grupo         public.grupos%rowtype;
  v_next_fecha    date;
  v_next_at       timestamptz;
  v_next_cierre   timestamptz;
  v_new_conv_id   uuid;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_conv from public.convocatorias where id = p_source_conv_id;
  if not found then
    return null;
  end if;
  if v_conv.grupo_id is null then
    return null;
  end if;

  select * into v_grupo from public.grupos where id = v_conv.grupo_id;
  if not found then
    return null;
  end if;
  if v_grupo.status <> 'activo' or v_grupo.auto_renovar = false then
    return null;
  end if;

  -- Si ya hay una conv abierta posterior, no creamos otra.
  if exists (
    select 1 from public.convocatorias
     where grupo_id = v_conv.grupo_id
       and status = 'abierta'
       and fecha > v_conv.fecha
  ) then
    return null;
  end if;

  -- Fecha: proxima ocurrencia de dia_semana ESTRICTAMENTE posterior a la
  -- fecha origen. Si la origen ya cae en el dia del grupo -> +7. Si estaba
  -- corrida (fecha manual) -> vuelve al dia del grupo en vez de arrastrar el
  -- desfase.
  v_next_fecha := v_conv.fecha
    + (((v_grupo.dia_semana - extract(dow from v_conv.fecha)::int + 7) % 7))::int;
  if v_next_fecha <= v_conv.fecha then
    v_next_fecha := v_next_fecha + 7;
  end if;

  v_next_at := (v_next_fecha + v_grupo.hora)::timestamptz;
  v_next_cierre := v_next_at + (v_grupo.cierre_minutes_after_start || ' minutes')::interval;

  insert into public.convocatorias (
    fecha, hora, lugar_id, cupo_maximo, status, modo, grupo_id, cierre_at, created_by
  )
  values (
    v_next_fecha,
    v_grupo.hora,
    v_grupo.lugar_id,
    v_grupo.cupo_titulares,
    'abierta',
    'cerrada',
    v_conv.grupo_id,
    v_next_cierre,
    v_grupo.owner_id
  )
  returning id into v_new_conv_id;

  -- Roster ESTRICTAMENTE desde la conv origen (no-declinados, player_id no
  -- nulo). No se re-valida contra grupo_membresias (Bug 2).
  insert into public.convocatoria_players (
    convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
  )
  select v_new_conv_id,
         cp.player_id,
         'confirmado',
         cp.rol_en_convocatoria,
         cp.orden_suplente
    from public.convocatoria_players cp
   where cp.convocatoria_id = p_source_conv_id
     and cp.attendance_status <> 'declinado'
     and cp.player_id is not null
   on conflict (convocatoria_id, player_id) do nothing;

  -- Llenar cupos de titulares vacios con los primeros suplentes activos.
  declare
    v_titulares_count int;
    v_cupo int := v_grupo.cupo_titulares;
    v_faltan int;
    v_supl_id uuid;
  begin
    select count(*) into v_titulares_count
      from public.convocatoria_players
     where convocatoria_id = v_new_conv_id
       and rol_en_convocatoria = 'titular'
       and attendance_status <> 'declinado';
    v_faltan := v_cupo - v_titulares_count;
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

  return v_new_conv_id;
end;
$$;

comment on function public.create_next_convocatoria(uuid) is
  'Fase 10: como Bug 4 pero la fecha de la siguiente snapea al dia habitual del grupo (proxima ocurrencia de dia_semana posterior a la origen) en vez de +7 a ciegas. Worker de auto-renovacion: hereda el roster no-declinado de la conv origen. Admin-only.';

revoke all on function public.create_next_convocatoria(uuid) from public;
grant execute on function public.create_next_convocatoria(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- (2) set_convocatoria_cupo: editar titulares de una conv abierta + reacomodar.
-- ----------------------------------------------------------------------------
create or replace function public.set_convocatoria_cupo(
  p_convocatoria_id uuid,
  p_nuevo_cupo      int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.convocatorias%rowtype;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_conv from public.convocatorias where id = p_convocatoria_id for update;
  if not found then
    raise exception 'convocatoria_not_found' using errcode = 'P0053';
  end if;
  if v_conv.status <> 'abierta' then
    raise exception 'convocatoria_no_abierta' using errcode = 'P0060';
  end if;
  if p_nuevo_cupo < 6 or p_nuevo_cupo > 24 then
    raise exception 'cupo_fuera_de_rango'
      using errcode = 'P0061', detail = p_nuevo_cupo::text;
  end if;

  update public.convocatorias
     set cupo_maximo = p_nuevo_cupo
   where id = p_convocatoria_id;

  -- Re-dividir el roster no-declinado por un orden unificado:
  --   titulares primero (por added_at), luego suplentes (por orden_suplente).
  -- Los primeros p_nuevo_cupo quedan titulares; el resto suplentes 1..M.
  -- Las filas declinadas quedan intactas (fuera del roster activo).
  with ordenado as (
    select cp.id,
           row_number() over (
             order by
               (case when cp.rol_en_convocatoria = 'titular' then 0 else 1 end),
               (case when cp.rol_en_convocatoria = 'titular'
                     then extract(epoch from cp.added_at)
                     else cp.orden_suplente::numeric end),
               cp.id
           ) as pos
      from public.convocatoria_players cp
     where cp.convocatoria_id = p_convocatoria_id
       and cp.attendance_status <> 'declinado'
  )
  update public.convocatoria_players cp
     set rol_en_convocatoria =
           (case when o.pos <= p_nuevo_cupo then 'titular' else 'suplente' end)::public.membresia_tipo,
         orden_suplente =
           case when o.pos <= p_nuevo_cupo then null else (o.pos - p_nuevo_cupo)::int end,
         updated_at = now()
    from ordenado o
   where cp.id = o.id;
end;
$$;

comment on function public.set_convocatoria_cupo(uuid, int) is
  'Fase 10: el admin cambia la cantidad de titulares (cupo_maximo) de una convocatoria ABIERTA antes de cerrarla, reacomodando el roster no-declinado (primeros N titulares por antiguedad, resto suplentes por orden de cola). P0060 si no esta abierta, P0061 si el cupo esta fuera de 6..24. SECURITY DEFINER, admin-only.';

revoke all on function public.set_convocatoria_cupo(uuid, int) from public;
grant execute on function public.set_convocatoria_cupo(uuid, int) to authenticated;
