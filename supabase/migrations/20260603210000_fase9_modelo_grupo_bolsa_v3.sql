-- ============================================================================
-- Fase 9 follow-up: modelo "grupo = bolsa" + roster en convocatoria
-- ============================================================================
--
-- Cambio fundamental de modelo:
--   - Grupo: lista plana de candidatos. No define titular/suplente. El orden
--     entre miembros se da por joined_at (orden de alta).
--   - Convocatoria: hereda la lista del grupo en orden de joined_at. Primeros
--     N (=grupo.cupo_titulares) -> titulares; resto -> suplentes (orden FIFO).
--   - Auto-renovacion: la siguiente convocatoria se arma a partir del estado
--     final de la convocatoria anterior (no del grupo). Quienes declinaron
--     en la anterior NO se copian automaticamente: pueden volver a anotarse
--     y al hacerlo entran al final de la cola.
--   - Cualquier alta nueva al grupo durante la vida de una convocatoria
--     abierta se replica como suplente al final via trigger.
--
-- Lo que NO cambia en este PR:
--   - grupo_membresias.tipo y .orden quedan en la tabla por compatibilidad,
--     pero la nueva logica los IGNORA. La unica fuente de verdad del orden
--     en el grupo es joined_at. Si se requiere reordenar manualmente, sera
--     un PR aparte.
--
-- RPCs:
--   * create_convocatoria_from_grupo(grupo_id, fecha): crea conv para el
--     grupo en una fecha dada (default: proxima ocurrencia de dia_semana).
--     Hereda lugar/hora/cupo del grupo. Arma roster por joined_at.
--   * close_and_create_next_convocatoria: re-escrito para armar desde la
--     anterior.
--   * player_join_open_convocatoria(conv_id): jugador del grupo que no esta
--     en el roster se anota; entra como titular si hay cupo, sino suplente
--     al final.
--   * Trigger sync_open_conv_after_membership_change: re-escrito para no
--     leer tipo/orden del grupo. Cuando alguien entra al grupo se agrega
--     a la conv abierta como titular (si hay cupo) o suplente al final.
--
-- Codigos de error (mantiene los existentes + uno nuevo):
--   P0059: jugador ya esta en el roster de la convocatoria.
-- ============================================================================

-- ============================================================================
-- create_convocatoria_from_grupo (reemplaza a bootstrap_convocatoria_for_grupo)
-- ============================================================================
drop function if exists public.bootstrap_convocatoria_for_grupo(uuid);

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

  -- Roster: miembros activos del grupo en orden joined_at. Primeros N
  -- titulares, resto suplentes con orden_suplente 1..M.
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

  return v_new_conv_id;
end;
$$;

comment on function public.create_convocatoria_from_grupo(uuid, date) is
  'Fase 9 v3: crea una convocatoria para un grupo en la fecha indicada (o proxima ocurrencia del dia_semana si NULL). Hereda lugar/hora/cupo del grupo. Arma el roster con los miembros activos en orden joined_at: primeros cupo_titulares como titulares, resto como suplentes FIFO.';

revoke all on function public.create_convocatoria_from_grupo(uuid, date) from public;
grant execute on function public.create_convocatoria_from_grupo(uuid, date) to authenticated;

-- ============================================================================
-- close_and_create_next_convocatoria (re-escrito desde la conv anterior)
-- ============================================================================
create or replace function public.close_and_create_next_convocatoria(
  p_convocatoria_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv          public.convocatorias%rowtype;
  v_grupo         public.grupos%rowtype;
  v_partido_at    timestamptz;
  v_cierre_at     timestamptz;
  v_next_fecha    date;
  v_next_at       timestamptz;
  v_next_cierre   timestamptz;
  v_new_conv_id   uuid;
begin
  select * into v_conv from public.convocatorias where id = p_convocatoria_id for update;
  if not found then
    raise exception 'convocatoria_not_found' using errcode = 'P0053';
  end if;
  if v_conv.status <> 'abierta' then
    return null;
  end if;

  if v_conv.grupo_id is not null then
    select * into v_grupo from public.grupos where id = v_conv.grupo_id;
  end if;

  -- Guarda: no permitir cerrar antes de fecha+hora+cierre_minutes.
  v_cierre_at := v_conv.cierre_at;
  if v_cierre_at is null then
    if v_conv.grupo_id is not null and v_grupo.id is not null then
      v_partido_at := (v_conv.fecha + v_grupo.hora)::timestamptz;
      v_cierre_at := v_partido_at + (v_grupo.cierre_minutes_after_start || ' minutes')::interval;
    else
      v_cierre_at := (v_conv.fecha + 1)::timestamptz;
    end if;
  end if;
  if now() < v_cierre_at then
    raise exception 'partido_not_yet_finished'
      using errcode = 'P0055', detail = v_cierre_at::text;
  end if;

  -- Cerrar la actual.
  update public.convocatorias set status = 'cerrada' where id = p_convocatoria_id;

  -- Si no hay grupo, o no auto-renueva, o grupo no esta activo: no hay siguiente.
  if v_conv.grupo_id is null or v_grupo.id is null then
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

  v_next_fecha := v_conv.fecha + 7;
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

  -- Armar roster a partir de la conv anterior: los no-declinados que sigan
  -- en el grupo activo se copian con su rol y orden. Solo player_id no nulo.
  insert into public.convocatoria_players (
    convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
  )
  select v_new_conv_id,
         cp.player_id,
         'confirmado',
         cp.rol_en_convocatoria,
         cp.orden_suplente
    from public.convocatoria_players cp
    join public.grupo_membresias gm
      on gm.grupo_id = v_conv.grupo_id
     and gm.player_id = cp.player_id
     and gm.status = 'activo'
   where cp.convocatoria_id = p_convocatoria_id
     and cp.attendance_status <> 'declinado'
     and cp.player_id is not null
   on conflict (convocatoria_id, player_id) do nothing;

  -- Llenar cupos de titulares vacios con los primeros suplentes activos.
  -- Esto cubre los huecos que dejaron los que se fueron del grupo.
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

comment on function public.close_and_create_next_convocatoria(uuid) is
  'Fase 9 v3: cierra una conv y arma la siguiente +7d a partir del estado de la anterior. Solo se copian los no-declinados que sigan en el grupo activo. Huecos en titulares se llenan con suplentes activos en orden. Quien declino no se copia automaticamente (puede anotarse despues con player_join_open_convocatoria).';

-- ============================================================================
-- player_join_open_convocatoria
-- ============================================================================
-- El jugador esta en el grupo activo pero no en el roster de la conv abierta.
-- Lo anotamos: titular si hay cupo, sino suplente al final.
create or replace function public.player_join_open_convocatoria(p_convocatoria_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id       uuid;
  v_conv            public.convocatorias%rowtype;
  v_grupo           public.grupos%rowtype;
  v_existing_cp_id  uuid;
  v_existing_status public.attendance_status;
  v_in_grupo        boolean;
  v_titulares_count int;
  v_next_orden      int;
  v_tipo            public.membresia_tipo;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'not_a_player' using errcode = 'P0040';
  end if;

  select * into v_conv from public.convocatorias where id = p_convocatoria_id;
  if not found then
    raise exception 'convocatoria_not_found' using errcode = 'P0053';
  end if;
  if v_conv.status <> 'abierta' then
    raise exception 'convocatoria_not_open' using errcode = 'P0057', detail = v_conv.status::text;
  end if;
  if v_conv.grupo_id is null then
    raise exception 'convocatoria_sin_grupo' using errcode = 'P0053';
  end if;

  select * into v_grupo from public.grupos where id = v_conv.grupo_id;
  if not found then
    raise exception 'grupo_not_found' using errcode = 'P0050';
  end if;

  -- Player debe estar activo en el grupo.
  select exists (
    select 1 from public.grupo_membresias
     where grupo_id = v_conv.grupo_id
       and player_id = v_player_id
       and status = 'activo'
  ) into v_in_grupo;
  if not v_in_grupo then
    raise exception 'not_in_grupo' using errcode = 'P0044';
  end if;

  -- Si ya tiene fila en la conv, manejamos por estado.
  select id, attendance_status
    into v_existing_cp_id, v_existing_status
    from public.convocatoria_players
   where convocatoria_id = p_convocatoria_id
     and player_id = v_player_id
   for update;

  if found and v_existing_status <> 'declinado' then
    raise exception 'already_in_convocatoria' using errcode = 'P0059';
  end if;

  -- Decidir rol segun cupo de titulares en la conv.
  select count(*) into v_titulares_count
    from public.convocatoria_players
   where convocatoria_id = p_convocatoria_id
     and rol_en_convocatoria = 'titular'
     and attendance_status <> 'declinado';

  if v_titulares_count < v_grupo.cupo_titulares then
    v_tipo := 'titular';
    v_next_orden := null;
  else
    v_tipo := 'suplente';
    select coalesce(max(orden_suplente), 0) + 1 into v_next_orden
      from public.convocatoria_players
     where convocatoria_id = p_convocatoria_id
       and rol_en_convocatoria = 'suplente'
       and attendance_status <> 'declinado';
  end if;

  if v_existing_cp_id is not null then
    -- Tenia fila declinada: la reactivamos.
    update public.convocatoria_players
       set attendance_status = 'confirmado',
           rol_en_convocatoria = v_tipo,
           orden_suplente = v_next_orden,
           updated_at = now()
     where id = v_existing_cp_id;
  else
    insert into public.convocatoria_players (
      convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
    )
    values (
      p_convocatoria_id, v_player_id, 'confirmado', v_tipo, v_next_orden
    );
  end if;

  return v_tipo::text;
end;
$$;

comment on function public.player_join_open_convocatoria(uuid) is
  'Fase 9 v3: el jugador del grupo se anota a una convocatoria abierta donde no estaba en el roster (o estaba como declinado). Titular si hay cupo, sino suplente al final.';

revoke all on function public.player_join_open_convocatoria(uuid) from public;
grant execute on function public.player_join_open_convocatoria(uuid) to authenticated;

-- ============================================================================
-- Trigger sync_open_conv_after_membership_change (re-escrito)
-- ============================================================================
-- Ya no lee tipo/orden del grupo. Reacciona al status de membresia:
--   - Pasa a activo (alta o reactivacion): si no esta en la conv abierta,
--     lo agrega. Titular si hay cupo, sino suplente al final.
--   - Pasa a inactivo (baja del grupo o DELETE): lo saca de la conv abierta.
--     Si era titular, sube el primer suplente y compacta.
-- ============================================================================
create or replace function public.sync_open_conv_after_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open_conv_id   uuid;
  v_grupo_id       uuid;
  v_cupo_titulares int;
  v_titulares_count int;
  v_was_active     boolean := false;
  v_is_active      boolean := false;
  v_existing_id    uuid;
  v_existing_rol   public.membresia_tipo;
  v_existing_orden int;
  v_existing_status public.attendance_status;
  v_first_supl_id  uuid;
  v_next_orden     int;
  v_target_player  uuid;
begin
  if tg_op = 'DELETE' then
    v_grupo_id := old.grupo_id;
    v_target_player := old.player_id;
  else
    v_grupo_id := new.grupo_id;
    v_target_player := new.player_id;
  end if;

  -- Conv abierta del grupo.
  select id into v_open_conv_id
    from public.convocatorias
   where grupo_id = v_grupo_id
     and status = 'abierta'
   order by fecha desc
   limit 1;
  if v_open_conv_id is null then
    return coalesce(new, old);
  end if;

  select cupo_titulares into v_cupo_titulares from public.grupos where id = v_grupo_id;

  if tg_op in ('UPDATE', 'DELETE') then
    v_was_active := (old.status = 'activo');
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_is_active := (new.status = 'activo');
  end if;

  -- 1) Baja del grupo (paso a inactivo o DELETE).
  if v_was_active and not v_is_active then
    select id, rol_en_convocatoria, orden_suplente, attendance_status
      into v_existing_id, v_existing_rol, v_existing_orden, v_existing_status
      from public.convocatoria_players
     where convocatoria_id = v_open_conv_id
       and player_id = v_target_player
       and attendance_status <> 'declinado';

    if found then
      delete from public.convocatoria_players where id = v_existing_id;
      if v_existing_rol = 'titular' then
        select id into v_first_supl_id
          from public.convocatoria_players
         where convocatoria_id = v_open_conv_id
           and rol_en_convocatoria = 'suplente'
           and attendance_status <> 'declinado'
         order by orden_suplente asc
         limit 1;
        if found then
          update public.convocatoria_players
             set rol_en_convocatoria = 'titular',
                 orden_suplente = null,
                 updated_at = now()
           where id = v_first_supl_id;
          perform public._conv_compactar_cola(v_open_conv_id, 1);
        end if;
      elsif v_existing_rol = 'suplente' and v_existing_orden is not null then
        perform public._conv_compactar_cola(v_open_conv_id, v_existing_orden);
      end if;
    end if;
    return coalesce(new, old);
  end if;

  -- 2) Alta o reactivacion al grupo. Si ya tiene fila no-declinada en la
  -- conv (caso raro: el trigger ya lo agrego antes), no tocamos.
  if v_is_active and not v_was_active then
    select id, attendance_status
      into v_existing_id, v_existing_status
      from public.convocatoria_players
     where convocatoria_id = v_open_conv_id
       and player_id = v_target_player
     for update;

    if found and v_existing_status <> 'declinado' then
      return coalesce(new, old);
    end if;

    -- Decidir rol por cupo.
    select count(*) into v_titulares_count
      from public.convocatoria_players
     where convocatoria_id = v_open_conv_id
       and rol_en_convocatoria = 'titular'
       and attendance_status <> 'declinado';

    if v_titulares_count < v_cupo_titulares then
      if v_existing_id is not null then
        update public.convocatoria_players
           set attendance_status = 'confirmado',
               rol_en_convocatoria = 'titular',
               orden_suplente = null,
               updated_at = now()
         where id = v_existing_id;
      else
        insert into public.convocatoria_players (
          convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
        ) values (v_open_conv_id, v_target_player, 'confirmado', 'titular', null);
      end if;
    else
      select coalesce(max(orden_suplente), 0) + 1 into v_next_orden
        from public.convocatoria_players
       where convocatoria_id = v_open_conv_id
         and rol_en_convocatoria = 'suplente'
         and attendance_status <> 'declinado';
      if v_existing_id is not null then
        update public.convocatoria_players
           set attendance_status = 'confirmado',
               rol_en_convocatoria = 'suplente',
               orden_suplente = v_next_orden,
               updated_at = now()
         where id = v_existing_id;
      else
        insert into public.convocatoria_players (
          convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
        ) values (v_open_conv_id, v_target_player, 'confirmado', 'suplente', v_next_orden);
      end if;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

comment on function public.sync_open_conv_after_membership_change() is
  'Fase 9 v3: sincroniza la convocatoria abierta del grupo con cambios en membresias. Alta -> entra como titular si hay cupo, sino suplente al final. Baja -> sale y sube primer suplente si liberaba titular. Ignora tipo/orden de grupo_membresias (legacy).';
