-- ============================================================================
-- FUT-114 (Fase 12 / A1): RPCs del modo presentismo
-- ============================================================================
--
-- abrir_cancha:        crea la sesión (convocatoria modo='presentismo', SIN
--                      roster previo, cierre_at NULL para que el cron la ignore).
-- checkin_miembro:     suma a un miembro activo del grupo, con llegada_at = now().
-- checkin_probador:    wrapper sobre agregar_invitado_a_convocatoria (NN rating 6)
--                      que además sella llegada_at. No toca esa función.
-- quitar_checkin:      saca a alguien del check-in (corrige errores). Si era
--                      probador (is_guest) borra también el registro fantasma.
-- guardar_armado_presentismo: persiste el snapshot del armado en cancha.
--
-- El "present-list" (los que están en la cancha) = convocatoria_players de la
-- conv con llegada_at IS NOT NULL. Por eso NO hace falta tocar el trigger
-- sync_open_conv_after_membership_change: si un alta/baja de membresía agrega una
-- fila por trigger, nace con llegada_at NULL y queda fuera del present-list.
--
-- Gate: can_manage_grupo / can_manage_convocatoria (admin o coordinador del grupo).
-- Códigos de error nuevos:
--   P0080: convocatoria_no_presentismo (la operación es solo para modo presentismo).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- abrir_cancha
-- ---------------------------------------------------------------------------
create or replace function public.abrir_cancha(
  p_grupo_id uuid,
  p_fecha    date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grupo       public.grupos%rowtype;
  v_partido_at  timestamptz;
  v_fecha       date;
  v_existing_id uuid;
  v_new_conv_id uuid;
begin
  if not public.can_manage_grupo(p_grupo_id) then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;

  select * into v_grupo from public.grupos where id = p_grupo_id;
  if not found then
    raise exception 'grupo_not_found' using errcode = 'P0050';
  end if;
  if v_grupo.status <> 'activo' then
    raise exception 'grupo_not_active' using errcode = 'P0051';
  end if;

  if p_fecha is null then
    v_partido_at := public._next_partido_at(v_grupo.dia_semana, v_grupo.hora);
    v_fecha := v_partido_at::date;
  else
    v_fecha := p_fecha;
  end if;

  if v_fecha < current_date then
    raise exception 'fecha_anterior_a_hoy' using errcode = 'P0058', detail = v_fecha::text;
  end if;

  -- Un grupo no puede tener dos convs no canceladas en la misma fecha.
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

  -- cierre_at NULL a propósito: el cron de auto-renovación filtra por
  -- cierre_at IS NOT NULL, así que ignora las sesiones presentismo. Se cierran
  -- manualmente al confirmar la sesión (A4).
  insert into public.convocatorias (
    fecha, hora, lugar_id, cupo_maximo, status, modo, grupo_id, cierre_at, created_by
  )
  values (
    v_fecha, v_grupo.hora, v_grupo.lugar_id, v_grupo.cupo_titulares,
    'abierta', 'presentismo', p_grupo_id, null, coalesce(auth.uid(), v_grupo.owner_id)
  )
  returning id into v_new_conv_id;

  return v_new_conv_id;
end;
$$;

comment on function public.abrir_cancha(uuid, date) is
  'FUT-114: abre una sesión presentismo (convocatoria modo=presentismo sin roster, cierre_at NULL). Gate can_manage_grupo.';

revoke all on function public.abrir_cancha(uuid, date) from public, anon;
grant execute on function public.abrir_cancha(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- checkin_miembro
-- ---------------------------------------------------------------------------
create or replace function public.checkin_miembro(
  p_convocatoria_id uuid,
  p_player_id       uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv            public.convocatorias%rowtype;
  v_in_grupo        boolean;
  v_existing_id     uuid;
  v_existing_status public.attendance_status;
  v_existing_lleg   timestamptz;
begin
  if not public.can_manage_convocatoria(p_convocatoria_id) then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;

  select * into v_conv from public.convocatorias where id = p_convocatoria_id for update;
  if not found then
    raise exception 'convocatoria_not_found' using errcode = 'P0053';
  end if;
  if v_conv.modo <> 'presentismo' then
    raise exception 'convocatoria_no_presentismo' using errcode = 'P0080';
  end if;
  if v_conv.status <> 'abierta' then
    raise exception 'convocatoria_not_open' using errcode = 'P0057', detail = v_conv.status::text;
  end if;
  if v_conv.grupo_id is null then
    raise exception 'convocatoria_sin_grupo' using errcode = 'P0053';
  end if;

  select exists (
    select 1 from public.grupo_membresias
     where grupo_id = v_conv.grupo_id
       and player_id = p_player_id
       and status = 'activo'
  ) into v_in_grupo;
  if not v_in_grupo then
    raise exception 'not_in_grupo' using errcode = 'P0044';
  end if;

  select id, attendance_status, llegada_at
    into v_existing_id, v_existing_status, v_existing_lleg
    from public.convocatoria_players
   where convocatoria_id = p_convocatoria_id and player_id = p_player_id
   for update;

  if found then
    -- Ya presente (check-in previo) → duplicado.
    if v_existing_lleg is not null and v_existing_status <> 'declinado' then
      raise exception 'already_checked_in' using errcode = 'P0059';
    end if;
    -- Fila sin llegada (auto-agregada por trigger) o declinada → la activamos.
    update public.convocatoria_players
       set attendance_status   = 'confirmado',
           rol_en_convocatoria = 'titular',
           orden_suplente      = null,
           llegada_at          = now(),
           updated_at          = now()
     where id = v_existing_id;
  else
    insert into public.convocatoria_players (
      convocatoria_id, player_id, attendance_status,
      rol_en_convocatoria, orden_suplente, llegada_at
    )
    values (
      p_convocatoria_id, p_player_id, 'confirmado', 'titular', null, now()
    );
  end if;
end;
$$;

comment on function public.checkin_miembro(uuid, uuid) is
  'FUT-114: check-in en cancha de un miembro activo del grupo (llegada_at = now()). Gate can_manage_convocatoria. Solo modo presentismo.';

revoke all on function public.checkin_miembro(uuid, uuid) from public, anon;
grant execute on function public.checkin_miembro(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- checkin_probador (wrapper sobre agregar_invitado_a_convocatoria)
-- ---------------------------------------------------------------------------
create or replace function public.checkin_probador(
  p_convocatoria_id uuid,
  p_nombre          text,
  p_score           int default 6
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv   public.convocatorias%rowtype;
  v_result jsonb;
begin
  if not public.can_manage_convocatoria(p_convocatoria_id) then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;

  select * into v_conv from public.convocatorias where id = p_convocatoria_id;
  if not found then
    raise exception 'convocatoria_not_found' using errcode = 'P0053';
  end if;
  if v_conv.modo <> 'presentismo' then
    raise exception 'convocatoria_no_presentismo' using errcode = 'P0080';
  end if;

  -- Crea el registro fantasma + lo suma a la conv (gate + rol por cupo adentro).
  v_result := public.agregar_invitado_a_convocatoria(p_convocatoria_id, p_nombre, p_score);

  -- Sella la llegada para que entre al present-list.
  update public.convocatoria_players
     set llegada_at = now(), updated_at = now()
   where convocatoria_id = p_convocatoria_id
     and player_id = (v_result ->> 'player_id')::uuid;

  return v_result;
end;
$$;

comment on function public.checkin_probador(uuid, text, int) is
  'FUT-114: check-in de un probador (NN, rating 6 por default) en modo presentismo. Reusa agregar_invitado_a_convocatoria y sella llegada_at. Gate can_manage_convocatoria.';

revoke all on function public.checkin_probador(uuid, text, int) from public, anon;
grant execute on function public.checkin_probador(uuid, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- quitar_checkin
-- ---------------------------------------------------------------------------
create or replace function public.quitar_checkin(
  p_convocatoria_id uuid,
  p_player_id       uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv      public.convocatorias%rowtype;
  v_is_guest  boolean;
begin
  if not public.can_manage_convocatoria(p_convocatoria_id) then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;

  select * into v_conv from public.convocatorias where id = p_convocatoria_id;
  if not found then
    raise exception 'convocatoria_not_found' using errcode = 'P0053';
  end if;
  if v_conv.modo <> 'presentismo' then
    raise exception 'convocatoria_no_presentismo' using errcode = 'P0080';
  end if;

  select is_guest into v_is_guest from public.players where id = p_player_id;

  delete from public.convocatoria_players
   where convocatoria_id = p_convocatoria_id and player_id = p_player_id;

  -- Si era probador (registro fantasma de un solo uso), lo borramos también.
  if coalesce(v_is_guest, false) then
    delete from public.players where id = p_player_id and is_guest = true;
  end if;
end;
$$;

comment on function public.quitar_checkin(uuid, uuid) is
  'FUT-114: saca a alguien del check-in (modo presentismo). Si era probador (is_guest) borra el registro fantasma. Gate can_manage_convocatoria.';

revoke all on function public.quitar_checkin(uuid, uuid) from public, anon;
grant execute on function public.quitar_checkin(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- guardar_armado_presentismo
-- ---------------------------------------------------------------------------
create or replace function public.guardar_armado_presentismo(
  p_convocatoria_id uuid,
  p_armado          jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.convocatorias%rowtype;
begin
  if not public.can_manage_convocatoria(p_convocatoria_id) then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;

  select * into v_conv from public.convocatorias where id = p_convocatoria_id;
  if not found then
    raise exception 'convocatoria_not_found' using errcode = 'P0053';
  end if;
  if v_conv.modo <> 'presentismo' then
    raise exception 'convocatoria_no_presentismo' using errcode = 'P0080';
  end if;
  if p_armado is null or jsonb_typeof(p_armado) <> 'object' then
    raise exception 'armado_invalido' using errcode = 'P0001';
  end if;

  update public.convocatorias
     set presentismo_armado = p_armado, updated_at = now()
   where id = p_convocatoria_id;
end;
$$;

comment on function public.guardar_armado_presentismo(uuid, jsonb) is
  'FUT-114: persiste el snapshot del armado en cancha (presentismo_armado). Gate can_manage_convocatoria. Solo modo presentismo.';

revoke all on function public.guardar_armado_presentismo(uuid, jsonb) from public, anon;
grant execute on function public.guardar_armado_presentismo(uuid, jsonb) to authenticated;
