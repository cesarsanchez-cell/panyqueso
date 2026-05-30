-- ============================================================================
-- Fase 9 fix (Bug 2): close_and_create_next_convocatoria deja de re-leer grupo
-- ============================================================================
--
-- Problema reportado en prod (2026-05-27): al auto-renovar, la nueva conv se
-- armaba "desde el grupo" y no respetaba estrictamente el roster de la conv
-- anterior.
--
-- Causa: el INSERT del roster hacia un JOIN contra public.grupo_membresias
-- (status='activo') para "validar que sigan en el grupo". Esa re-validacion
-- es redundante y, en estados de membresia inconsistentes, podia dropear a
-- alguien que SI estaba en la conv anterior y luego rellenar el hueco con un
-- suplente distinto — cambiando el roster sin que nadie declinara.
--
-- Fix: copiar estrictamente desde la convocatoria anterior (no-declinados,
-- con player_id no nulo). No hace falta re-validar contra el grupo: el trigger
-- sync_open_conv_after_membership_change ya saca del roster a quien se da de
-- baja del grupo durante la vida de la conv, asi que la regla "si dejo el
-- grupo, no se carrea" queda cubierta sin re-leer grupo_membresias.
--
-- El resto de la funcion (guardas de cierre, creacion de la conv +7d, relleno
-- de cupos de titulares con suplentes) queda igual.
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

  -- Armar roster ESTRICTAMENTE desde la conv anterior: los no-declinados con
  -- player_id no nulo se copian con su rol y orden. Sin JOIN contra el grupo:
  -- el roster de la conv anterior ya refleja las bajas (las mantiene el
  -- trigger sync_open_conv_after_membership_change). Los invitados libres
  -- (player_id null) son puntuales y NO se carrean.
  insert into public.convocatoria_players (
    convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
  )
  select v_new_conv_id,
         cp.player_id,
         'confirmado',
         cp.rol_en_convocatoria,
         cp.orden_suplente
    from public.convocatoria_players cp
   where cp.convocatoria_id = p_convocatoria_id
     and cp.attendance_status <> 'declinado'
     and cp.player_id is not null
   on conflict (convocatoria_id, player_id) do nothing;

  -- Llenar cupos de titulares vacios con los primeros suplentes activos.
  -- Esto cubre los huecos que dejaron los declinados de la anterior.
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
  'Fase 9 fix Bug 2: cierra una conv y arma la siguiente +7d copiando ESTRICTAMENTE el roster de la anterior (no-declinados). Ya no re-valida contra grupo_membresias: el trigger de sync mantiene el roster al dia con las bajas del grupo. Huecos en titulares se llenan con suplentes activos en orden.';
