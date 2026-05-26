-- ============================================================================
-- Fase 9 follow-up: semantica correcta de decline + guarda de cierre temprano
-- ============================================================================
--
-- Dos correcciones conceptuales pedidas por el usuario al probar PR-B:
--
-- (1) "Bajarse de 1 convocatoria no es bajarse del grupo, solo de esa
--     convocatoria". La version original de player_decline_convocatoria
--     inactivaba la grupo_membresia del titular y promovia al suplente #1
--     a titular permanente, renumerando la cola. Eso es semantica de "me
--     voy del grupo". Para una baja puntual de una semana basta con marcar
--     attendance_status='declinado'. La membresia del jugador como titular
--     o suplente del grupo se preserva, asi vuelve a ser invitado en la
--     proxima convocatoria automaticamente.
--
--     Si el admin necesita llenar el cupo de esa convocatoria con un
--     suplente, eso queda como accion explicita (no esta en este PR).
--
-- (2) "No se puede armar una convocatoria hasta que no se haya cumplido el
--     evento de la convocatoria vigente, es decir horario de inicio + 60
--     minutos". close_and_create_next_convocatoria recibe esta guarda: si
--     now() es anterior a cierre_at (=fecha+hora+cierre_minutes_after_start)
--     levanta P0055. El cron natural respeta esto porque solo dispara post
--     cierre_at; la guarda protege contra el boton manual de test y contra
--     cualquier disparador prematuro.
--
-- Codigos de error:
--   P0055: la convocatoria vigente todavia no se cumplio (fecha+hora+60min)
-- ============================================================================

create or replace function public.player_decline_convocatoria(p_convocatoria_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id    uuid;
  v_cp_id        uuid;
  v_cp_status    public.attendance_status;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'not_a_player' using errcode = 'P0040';
  end if;

  select id, attendance_status
    into v_cp_id, v_cp_status
    from public.convocatoria_players
   where convocatoria_id = p_convocatoria_id
     and player_id = v_player_id
   for update;

  if not found then
    raise exception 'not_invited' using errcode = 'P0041';
  end if;

  -- Idempotente.
  if v_cp_status = 'declinado' then
    return;
  end if;

  update public.convocatoria_players
     set attendance_status = 'declinado',
         updated_at = now()
   where id = v_cp_id;

  -- Nota: NO tocamos grupo_membresias. Bajarse de una convocatoria no es
  -- bajarse del grupo. La proxima convocatoria del ciclo vuelve a invitar
  -- al jugador como titular o suplente segun su membresia.
end;
$$;

comment on function public.player_decline_convocatoria(uuid) is
  'Fase 9 follow-up: el jugador se baja SOLO de esta convocatoria (un click). Marca attendance_status=declinado, no toca grupo_membresias. La membresia permanente del jugador queda intacta y vuelve a ser invitado en la proxima convocatoria del ciclo.';

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

  -- Resolver grupo (puede ser null en convocatorias MVP-style).
  if v_conv.grupo_id is not null then
    select * into v_grupo from public.grupos where id = v_conv.grupo_id;
  end if;

  -- Guarda: no permitimos cerrar antes de cierre_at (fecha+hora+60min por
  -- defecto). Si v_conv.cierre_at es null, lo derivamos del grupo cuando
  -- exista; si tampoco hay grupo, asumimos fecha+1 dia como cierre razonable.
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

  -- Conv sin grupo (MVP-style): solo cerramos.
  if v_conv.grupo_id is null then
    update public.convocatorias set status = 'cerrada' where id = p_convocatoria_id;
    return null;
  end if;

  -- Grupo borrado: solo cerramos.
  if v_grupo.id is null then
    update public.convocatorias set status = 'cerrada' where id = p_convocatoria_id;
    return null;
  end if;

  update public.convocatorias set status = 'cerrada' where id = p_convocatoria_id;

  if v_grupo.status <> 'activo' or v_grupo.auto_renovar = false then
    return null;
  end if;

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
    fecha, status, modo, grupo_id, cierre_at, created_by
  )
  values (
    v_next_fecha, 'abierta', 'cerrada', v_conv.grupo_id, v_next_cierre, v_grupo.owner_id
  )
  returning id into v_new_conv_id;

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
  'Fase 9 follow-up: cierra una convocatoria y crea la siguiente +7 dias si auto_renovar=true. Guarda: rechaza con P0055 si now() < cierre_at (no se puede cerrar antes de que el partido + 60min haya pasado).';
