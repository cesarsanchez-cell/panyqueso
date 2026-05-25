-- ============================================================================
-- Fase 9 PR 8: funcion claim_invite (alta atomica del jugador via invite)
-- ============================================================================
--
-- LA funcion critica del flujo de signup. Es la unica via permitida desde la
-- API para crear un players row asociado a un auth.user via invitation.
-- Atomica, SECURITY DEFINER, hace todo el alta en una transaccion.
--
-- Llamada desde el server action acceptInvite (app/invite/[token]/aceptar)
-- DESPUES de crear el auth.user via admin API. Si esta funcion falla, el
-- server action borra el auth.user creado para evitar orfanos.
--
-- Pasos:
--   1. Lock + validar invite (existe, pending, no expirado).
--   2. Validar phone no esta en players (collision check con FOR UPDATE).
--   3. Crear/actualizar profile con role='player' y el nombre nuevo.
--   4. Insertar player con phone, auth_user_id, fecha_nacimiento, edad,
--      role_field, position_pref, status='pending', ratings=0.
--   5. Agregar membresia al grupo:
--        - Si hay cupo libre titular -> tipo='titular'
--        - Sino -> tipo='suplente' al final de la cola (orden = max+1)
--   6. Si invite.convocatoria_id no es null -> insertar convocatoria_players
--      con attendance='confirmado'.
--   7. Marcar invite: used_at=now(), used_by_player_id=<nuevo>.
--
-- Error codes (P0020-P0029):
--   P0020 invite_not_found
--   P0021 invite_already_used
--   P0022 invite_declined
--   P0023 invite_expired
--   P0024 phone_collision     (otro player ya usa ese phone)
--
-- Triggers que pasan por aca:
--   players_enforce_immutability se ejecuta sobre el INSERT pero solo aplica
--   a UPDATE (ver create trigger). El INSERT pasa sin problemas.
--   players_compute_score se ejecuta y calcula internal_score a partir de
--   technical/physical/mental/edad. Como los ratings son 0 al alta y edad
--   esta presente, internal_score queda 0.
--
-- Defensa adicional:
--   El parametro p_auth_user_id es el id que el caller (server action) ya
--   creo via admin API. La funcion NO crea el auth.user — eso queda fuera de
--   PL/pgSQL. Si el caller pasa un auth_user_id que no existe en auth.users,
--   el FK del players.auth_user_id lo va a rechazar.
-- ============================================================================

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
  -- 1. Cargar invite con lock --------------------------------------------
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

  -- 2. Phone collision check ----------------------------------------------
  -- Si entre que se genero el invite y se acepto, alguien (otro admin) cargo
  -- un player con ese mismo phone, rechazamos.
  select id into v_existing_phone
  from public.players
  where phone = v_invite.phone
  for update;

  if found then
    raise exception 'phone_collision'
      using errcode = 'P0024',
            detail  = v_invite.phone;
  end if;

  -- 3. Profile -----------------------------------------------------------
  -- La row de profiles existe si el caller corrio supabase.auth.admin.createUser
  -- (un trigger interno de Supabase crea el profile automaticamente al
  -- crear auth.users). Pero no es garantia: lo hacemos UPSERT por las dudas
  -- y aprovechamos para setear role='player' + nombre real.
  insert into public.profiles (id, nombre, role)
  values (p_auth_user_id, p_nombre, 'player')
  on conflict (id) do update
    set nombre = excluded.nombre,
        role   = 'player';

  -- 4. Insertar player ---------------------------------------------------
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
    0, 0, 0,
    'baja',
    'pending',
    v_invite.created_by
  )
  returning id into v_new_player_id;

  -- 5. Membresia al grupo ------------------------------------------------
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

  -- 6. Convocatoria players (solo si el invite era para un partido) -----
  if v_invite.convocatoria_id is not null then
    insert into public.convocatoria_players (convocatoria_id, player_id, attendance_status)
    values (v_invite.convocatoria_id, v_new_player_id, 'confirmado')
    on conflict do nothing;
  end if;

  -- 7. Marcar invite como used ------------------------------------------
  update public.player_invitations
  set used_at = now(),
      used_by_player_id = v_new_player_id
  where id = v_invite.id;

  return v_new_player_id;
end;
$$;

comment on function public.claim_invite(text, uuid, text, date, int, public.player_role_field, public.position_pref) is
  'Fase 9 PR 8: alta atomica del jugador via invitation. Crea player + membresia + convocatoria_players y marca el invite como used. Llamada desde el server action acceptInvite despues de crear el auth.user.';

revoke all on function public.claim_invite(text, uuid, text, date, int, public.player_role_field, public.position_pref) from public;
-- Solo el server action lo llama via service_role o anon authenticated.
-- Lo dejo en authenticated por simplicidad — el chequeo de capability es el
-- token (solo quien lo tenga puede ejecutar exitosamente).
grant execute on function public.claim_invite(text, uuid, text, date, int, public.player_role_field, public.position_pref) to authenticated, anon;
