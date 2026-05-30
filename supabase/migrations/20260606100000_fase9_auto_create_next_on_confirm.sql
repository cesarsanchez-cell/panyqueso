-- ============================================================================
-- Fase 9 fix (Bug 4): auto-crear la proxima convocatoria al confirmar el match
-- ============================================================================
--
-- Hasta ahora habia dos caminos en conflicto:
--   - confirmMatch (server action): pasaba la conv abierta -> cerrada y NO
--     creaba la siguiente.
--   - close_and_create_next_convocatoria (boton manual): exigia status=abierta
--     y now() >= cierre_at. Una vez confirmado el match (cerrada), ese boton
--     ya no podia auto-renovar.
--   Resultado: al confirmar el match no aparecia la proxima convocatoria.
--
-- Fix: extraer el "armado de la siguiente conv" a un worker reutilizable sin
-- las guardas de cierre (create_next_convocatoria), y llamarlo tanto desde
-- close_and_create_next_convocatoria (boton manual, conserva sus guardas)
-- como desde confirmMatch (best-effort, ver server action).
--
-- create_next_convocatoria hereda el roster ESTRICTAMENTE desde la conv origen
-- (no-declinados), igual que el fix del Bug 2: no re-lee grupo_membresias.
-- ============================================================================

-- ============================================================================
-- create_next_convocatoria: worker sin guardas de cierre.
-- ============================================================================
-- Crea la conv +7d a partir de la conv origen (cualquier status). Solo procede
-- si el grupo esta activo y auto_renovar, y si no hay ya una conv abierta
-- posterior. Devuelve el id de la nueva conv, o null si no corresponde crear.
-- Admin-only (chequeo interno) para no ampliar superficie via SECURITY DEFINER.
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

  -- Roster ESTRICTAMENTE desde la conv origen (no-declinados, player_id no
  -- nulo). No se re-valida contra grupo_membresias (Bug 2): el roster origen
  -- ya refleja las bajas via el trigger de sync. Invitados libres no se carrean.
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
  'Fase 9 Bug 4: worker que arma la conv +7d a partir de una conv origen (cualquier status), heredando el roster no-declinado. Solo si el grupo esta activo+auto_renovar y no hay abierta posterior. Admin-only. Usado por close_and_create_next_convocatoria y por confirmMatch.';

revoke all on function public.create_next_convocatoria(uuid) from public;
grant execute on function public.create_next_convocatoria(uuid) to authenticated;

-- ============================================================================
-- close_and_create_next_convocatoria: ahora delega el armado en el worker.
-- Conserva sus guardas (status=abierta, now() >= cierre_at) + el cierre.
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

  -- Cerrar la actual y delegar el armado de la siguiente.
  update public.convocatorias set status = 'cerrada' where id = p_convocatoria_id;

  return public.create_next_convocatoria(p_convocatoria_id);
end;
$$;

comment on function public.close_and_create_next_convocatoria(uuid) is
  'Fase 9 Bug 4: cierra una conv abierta (guardas de status + cierre_at) y delega el armado de la siguiente en create_next_convocatoria.';
