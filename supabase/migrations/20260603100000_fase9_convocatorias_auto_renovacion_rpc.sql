-- ============================================================================
-- Fase 9: RPCs de auto-renovacion de convocatorias (PR-B)
-- ============================================================================
--
-- Dos funciones SECURITY DEFINER que implementan el flujo automatico:
--
-- 1. bootstrap_convocatoria_for_grupo(grupo_id):
--    Crea la PRIMERA convocatoria de un grupo cuando no tiene ninguna
--    abierta/cerrada vigente. Calcula la proxima fecha que cae en el
--    grupo.dia_semana (desde hoy hacia adelante; si hoy es el dia y la hora
--    todavia no paso, usa hoy; sino la semana siguiente).
--    Auto-popula convocatoria_players con los titulares activos del grupo.
--
-- 2. close_and_create_next_convocatoria(convocatoria_id):
--    Cierra la convocatoria especificada (status='cerrada') y, si el grupo
--    tiene auto_renovar=true, crea la siguiente (fecha = current_fecha + 7
--    dias). Auto-popula con titulares activos al momento del cierre.
--    Idempotente: si la conv ya esta cerrada, no hace nada.
--
-- Ambas:
-- - Solo pueden invocarse por admin (vía requireRole en el server action) o
--   por el cron (vía service role bypaseando RLS).
-- - Devuelven el id de la nueva convocatoria, o NULL si no se creo (caso de
--   auto_renovar=false en close_and_create).
-- - Manejan la columna cierre_at de la nueva conv.
-- - Solo invitan a los titulares como confirmados. Suplentes no se invitan
--   automaticamente; se suman via /mi-perfil "Volver al grupo".
--
-- Codigos de error:
--   P0050: grupo no existe
--   P0051: grupo no activo
--   P0052: ya hay una convocatoria abierta para el grupo (en bootstrap)
--   P0053: convocatoria no existe
--   P0054: convocatoria no esta abierta (close idempotente, no error)
-- ============================================================================

-- Helper: calcular la proxima fecha (timestamptz) que cae en un dia_semana,
-- considerando la hora del partido. Si hoy es el dia y la hora todavia no
-- paso, devuelve hoy. Sino, devuelve la siguiente semana.
create or replace function public._next_partido_at(
  p_dia_semana int,
  p_hora       time
)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  with hoy as (
    select
      current_date as today,
      extract(dow from current_date)::int as today_dow,
      (current_date + p_hora)::timestamptz as today_at
  )
  select case
    when hoy.today_dow = p_dia_semana and hoy.today_at > now() then hoy.today_at
    else (
      hoy.today + ((p_dia_semana - hoy.today_dow + 7) % 7)::int +
        case when hoy.today_dow = p_dia_semana then 7 else 0 end
    )::date + p_hora
  end::timestamptz
  from hoy;
$$;

comment on function public._next_partido_at(int, time) is
  'Fase 9 helper: calcula la proxima fecha+hora que cae en p_dia_semana. Si hoy es el dia y la hora aun no paso, devuelve hoy. Sino, semana siguiente.';

-- ============================================================================
-- bootstrap_convocatoria_for_grupo
-- ============================================================================
create or replace function public.bootstrap_convocatoria_for_grupo(p_grupo_id uuid)
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

  -- Si ya hay una convocatoria abierta para este grupo, no creamos otra.
  select id into v_existing_id
    from public.convocatorias
   where grupo_id = p_grupo_id
     and status = 'abierta'
   order by fecha desc
   limit 1;

  if found then
    raise exception 'open_convocatoria_already_exists'
      using errcode = 'P0052', detail = v_existing_id::text;
  end if;

  v_partido_at := public._next_partido_at(v_grupo.dia_semana, v_grupo.hora);
  v_fecha := v_partido_at::date;
  v_cierre_at := v_partido_at + (v_grupo.cierre_minutes_after_start || ' minutes')::interval;

  insert into public.convocatorias (
    fecha, status, modo, grupo_id, cierre_at, created_by
  )
  values (
    v_fecha, 'abierta', 'cerrada', p_grupo_id, v_cierre_at, v_grupo.owner_id
  )
  returning id into v_new_conv_id;

  -- Auto-poblar con titulares activos como confirmados.
  insert into public.convocatoria_players (convocatoria_id, player_id, attendance_status)
  select v_new_conv_id, gm.player_id, 'confirmado'
    from public.grupo_membresias gm
   where gm.grupo_id = p_grupo_id
     and gm.tipo = 'titular'
     and gm.status = 'activo'
   on conflict (convocatoria_id, player_id) do nothing;

  return v_new_conv_id;
end;
$$;

comment on function public.bootstrap_convocatoria_for_grupo(uuid) is
  'Fase 9 PR-B: crea la primera convocatoria abierta de un grupo en su proxima fecha de dia_semana. Auto-popula titulares activos como confirmados. Idempotente solo en el sentido de que falla con P0052 si ya hay una conv abierta.';

revoke all on function public.bootstrap_convocatoria_for_grupo(uuid) from public;
grant execute on function public.bootstrap_convocatoria_for_grupo(uuid) to authenticated;

-- ============================================================================
-- close_and_create_next_convocatoria
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
  v_next_fecha    date;
  v_next_at       timestamptz;
  v_next_cierre   timestamptz;
  v_new_conv_id   uuid;
begin
  select * into v_conv from public.convocatorias where id = p_convocatoria_id for update;
  if not found then
    raise exception 'convocatoria_not_found' using errcode = 'P0053';
  end if;

  -- Idempotente: si ya esta cerrada o jugada o cancelada, no hacemos nada.
  if v_conv.status <> 'abierta' then
    return null;
  end if;

  if v_conv.grupo_id is null then
    -- Conv del MVP sin grupo: solo la cerramos, no creamos siguiente.
    update public.convocatorias set status = 'cerrada' where id = p_convocatoria_id;
    return null;
  end if;

  select * into v_grupo from public.grupos where id = v_conv.grupo_id;
  if not found then
    -- Grupo borrado, solo cerramos.
    update public.convocatorias set status = 'cerrada' where id = p_convocatoria_id;
    return null;
  end if;

  -- Cerrar la actual.
  update public.convocatorias set status = 'cerrada' where id = p_convocatoria_id;

  -- Si el grupo no esta activo o no auto-renueva, no creamos siguiente.
  if v_grupo.status <> 'activo' or v_grupo.auto_renovar = false then
    return null;
  end if;

  -- Si ya hay una conv abierta posterior (raro pero posible si alguien
  -- creo manual), no creamos otra.
  if exists (
    select 1 from public.convocatorias
     where grupo_id = v_conv.grupo_id
       and status = 'abierta'
       and fecha > v_conv.fecha
  ) then
    return null;
  end if;

  -- Proxima fecha = current + 7 dias. Tomamos hora del grupo (puede haber
  -- cambiado desde la conv anterior).
  v_next_fecha := v_conv.fecha + 7;
  v_next_at := (v_next_fecha + v_grupo.hora)::timestamptz;
  v_next_cierre := v_next_at + (v_grupo.cierre_minutes_after_start || ' minutes')::interval;

  insert into public.convocatorias (
    fecha, status, modo, grupo_id, cierre_at, created_by
  )
  values (
    v_next_fecha, 'abierta', 'cerrada', v_conv.grupo_id, v_next_cierre, v_grupo.owner_id
  )
  returning id into v_new_conv_id;

  -- Auto-poblar con titulares activos del grupo al momento del cierre.
  insert into public.convocatoria_players (convocatoria_id, player_id, attendance_status)
  select v_new_conv_id, gm.player_id, 'confirmado'
    from public.grupo_membresias gm
   where gm.grupo_id = v_conv.grupo_id
     and gm.tipo = 'titular'
     and gm.status = 'activo'
   on conflict (convocatoria_id, player_id) do nothing;

  return v_new_conv_id;
end;
$$;

comment on function public.close_and_create_next_convocatoria(uuid) is
  'Fase 9 PR-B: cierra una convocatoria abierta y crea la siguiente +7 dias si el grupo tiene auto_renovar=true. Idempotente: si ya esta cerrada devuelve NULL. Si el grupo no auto-renueva o esta archivado, solo cierra. Auto-popula titulares activos.';

revoke all on function public.close_and_create_next_convocatoria(uuid) from public;
grant execute on function public.close_and_create_next_convocatoria(uuid) to authenticated;
