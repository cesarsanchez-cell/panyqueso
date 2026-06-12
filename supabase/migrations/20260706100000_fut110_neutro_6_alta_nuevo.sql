-- ============================================================================
-- FUT-110 (Fase 11): el jugador nuevo nace con rating NEUTRO 6 (no el piso 1)
-- ============================================================================
--
-- Hasta ahora todo jugador que se daba de alta vía invitación o link de grupo
-- nacía con technical/physical/mental = 1 (el mínimo legal). Eso lo hacía ver
-- pésimo y DESBALANCEABA los equipos hasta que alguien lo calificara.
--
-- Decisión de producto (el usuario): el jugador nuevo arranca NEUTRO = 6 (mitad
-- de la escala) con rating_confidence = 'baja' (= "sin calibrar todavía"). El
-- admin/coordinador lo afina después; mientras tanto entra parejo y no rompe el
-- balance. La confianza 'baja' es la señal de "falta calibrar".
--
-- Cambia los DOS únicos puntos donde se crea un jugador nuevo, ambos contextos
-- admin/coordinador:
--   - claim_invite       (alta vía invitación por token)
--   - claim_group_join   (alta vía link único de grupo)
--
-- Los 9 sub-ratings siguen NULL: el seed por grupo (grupo_membresias_seed_rating)
-- los coalesce a la base 6, así que el rating por grupo también nace en 6. El
-- internal_score lo recalcula el trigger players_compute_score. Único cambio de
-- valor: 1,1,1 -> 6,6,6. Todo lo demás (status approved, cupo, etc.) intacto.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. claim_invite: ratings 6/6/6
-- ---------------------------------------------------------------------------
create or replace function public.claim_invite(
  p_token            text,
  p_auth_user_id     uuid,
  p_nombre           text,
  p_fecha_nacimiento date,
  p_edad             int,
  p_role_field       public.player_role_field,
  p_position_pref    public.position_pref
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite           public.player_invitations%rowtype;
  v_existing_phone   uuid;
  v_grupo            public.grupos%rowtype;
  v_titulares_count  int;
  v_max_suplente     int;
  v_new_player_id    uuid;
  v_tipo             public.membresia_tipo;
  v_orden            int;
begin
  select * into v_invite
  from public.player_invitations
  where token = p_token
  for update;

  if not found then
    raise exception 'invite_not_found' using errcode = 'P0020';
  end if;
  if v_invite.used_at is not null then
    raise exception 'invite_already_used' using errcode = 'P0021';
  end if;
  if v_invite.declined_at is not null then
    raise exception 'invite_declined' using errcode = 'P0022';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'invite_expired' using errcode = 'P0023';
  end if;

  select id into v_existing_phone
  from public.players
  where phone = v_invite.phone
  for update;

  if found then
    raise exception 'phone_collision'
      using errcode = 'P0024',
            detail  = v_invite.phone;
  end if;

  insert into public.profiles (id, nombre, role)
  values (p_auth_user_id, p_nombre, 'player')
  on conflict (id) do update
    set nombre = excluded.nombre,
        role   = 'player';

  insert into public.players (
    nombre, edad, fecha_nacimiento, phone, auth_user_id,
    role_field, position_pref, positions_possible,
    technical, physical, mental, rating_confidence,
    status, created_by
  )
  values (
    p_nombre,
    p_edad,
    p_fecha_nacimiento,
    v_invite.phone,
    p_auth_user_id,
    p_role_field,
    p_position_pref,
    array[p_position_pref]::public.position_pref[],
    6, 6, 6,           -- NEUTRO: mitad de la escala; confianza baja = sin calibrar
    'baja',
    'approved',        -- invite del admin/coordinador = voto de confianza
    v_invite.created_by
  )
  returning id into v_new_player_id;

  select * into v_grupo
  from public.grupos
  where id = v_invite.grupo_id
  for share;

  if not found then
    raise exception 'grupo_not_found' using errcode = 'P0025';
  end if;

  select count(*) into v_titulares_count
  from public.grupo_membresias
  where grupo_id = v_invite.grupo_id
    and tipo = 'titular'
    and status = 'activo';

  if v_titulares_count < v_grupo.cupo_titulares then
    v_tipo := 'titular';
    v_orden := null;
  else
    select coalesce(max(orden), 0) into v_max_suplente
    from public.grupo_membresias
    where grupo_id = v_invite.grupo_id
      and tipo = 'suplente'
      and status = 'activo';
    v_tipo := 'suplente';
    v_orden := v_max_suplente + 1;
  end if;

  insert into public.grupo_membresias (grupo_id, player_id, tipo, orden, status)
  values (v_invite.grupo_id, v_new_player_id, v_tipo, v_orden, 'activo');

  if v_invite.convocatoria_id is not null then
    insert into public.convocatoria_players (convocatoria_id, player_id, attendance_status)
    values (v_invite.convocatoria_id, v_new_player_id, 'confirmado')
    on conflict do nothing;
  end if;

  update public.player_invitations
  set used_at = now(),
      used_by_player_id = v_new_player_id
  where id = v_invite.id;

  return v_new_player_id;
end;
$$;

comment on function public.claim_invite(text, uuid, text, date, int, public.player_role_field, public.position_pref) is
  'Fase 9 + FUT-110: alta atomica via invite. Jugador queda status=approved directo. Ratings NEUTROS 6/6/6 (confianza baja) hasta que admin/coordinador calibre.';

-- ---------------------------------------------------------------------------
-- 2. claim_group_join: ratings 6/6/6
-- ---------------------------------------------------------------------------
create or replace function public.claim_group_join(
  p_token            text,
  p_auth_user_id     uuid,
  p_phone            text,
  p_nombre           text,
  p_fecha_nacimiento date,
  p_edad             int,
  p_role_field       public.player_role_field,
  p_position_pref    public.position_pref
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grupo            public.grupos%rowtype;
  v_existing_phone   uuid;
  v_titulares_count  int;
  v_max_suplente     int;
  v_new_player_id    uuid;
  v_tipo             public.membresia_tipo;
  v_orden            int;
begin
  select * into v_grupo
  from public.grupos
  where join_token = p_token
  for update;

  if not found then
    raise exception 'join_token_not_found' using errcode = 'P0030';
  end if;
  if v_grupo.status <> 'activo' then
    raise exception 'grupo_archived' using errcode = 'P0031';
  end if;

  select id into v_existing_phone
  from public.players
  where phone = p_phone
  for update;

  if found then
    raise exception 'phone_collision'
      using errcode = 'P0024',
            detail  = p_phone;
  end if;

  insert into public.profiles (id, nombre, role)
  values (p_auth_user_id, p_nombre, 'player')
  on conflict (id) do update
    set nombre = excluded.nombre,
        role   = 'player';

  insert into public.players (
    nombre, edad, fecha_nacimiento, phone, auth_user_id,
    role_field, position_pref, positions_possible,
    technical, physical, mental, rating_confidence,
    status, created_by
  )
  values (
    p_nombre,
    p_edad,
    p_fecha_nacimiento,
    p_phone,
    p_auth_user_id,
    p_role_field,
    p_position_pref,
    array[p_position_pref]::public.position_pref[],
    6, 6, 6,           -- NEUTRO: mitad de la escala; confianza baja = sin calibrar
    'baja',
    'approved',            -- mismo criterio que claim_invite
    v_grupo.owner_id       -- "creado por" = dueño del grupo
  )
  returning id into v_new_player_id;

  select count(*) into v_titulares_count
  from public.grupo_membresias
  where grupo_id = v_grupo.id
    and tipo = 'titular'
    and status = 'activo';

  if v_titulares_count < v_grupo.cupo_titulares then
    v_tipo := 'titular';
    v_orden := null;
  else
    select coalesce(max(orden), 0) into v_max_suplente
    from public.grupo_membresias
    where grupo_id = v_grupo.id
      and tipo = 'suplente'
      and status = 'activo';
    v_tipo := 'suplente';
    v_orden := v_max_suplente + 1;
  end if;

  insert into public.grupo_membresias (grupo_id, player_id, tipo, orden, status)
  values (v_grupo.id, v_new_player_id, v_tipo, v_orden, 'activo');

  return v_new_player_id;
end;
$$;

comment on function public.claim_group_join(text, uuid, text, text, date, int, public.player_role_field, public.position_pref) is
  'Alta atomica via link unico de grupo + FUT-110: jugador approved con ratings NEUTROS 6/6/6 (confianza baja) hasta que admin/coordinador calibre.';
