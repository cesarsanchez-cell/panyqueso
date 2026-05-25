-- ============================================================================
-- Fase 9: claim_invite setea status='approved' directo
-- ============================================================================
--
-- Cambio de diseño: el jugador que viene via invite quedaba en
-- status='pending' esperando aprobacion del veedor, igual que un alta
-- manual. Pero la invitacion del admin YA es el voto de confianza: el
-- veedor no aporta nada chequeando un signup.
--
-- Nuevo flujo:
--   - Jugador acepta invite -> status='approved' directo. Visible para
--     convocatorias, generador de teams (con ratings 1/1/1 hasta que
--     admin proponga ratings reales).
--   - Admin va al detalle del jugador y usa el flujo existente de
--     proponer-cambio (update_sensitive_fields) para asignar
--     technical/physical/mental. Veedor aprueba esa propuesta. Ahi vive
--     el control de favoritismo.
--
-- Nota: PR 12 originalmente iba a crear assign_initial_ratings como un
-- action_type nuevo. Con este cambio probablemente ya no haga falta —
-- update_sensitive_fields cubre el mismo caso. Decidimos despues.
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
    1, 1, 1,
    'baja',
    'approved',         -- <-- cambio clave: invite del admin = voto de confianza
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
  'Fase 9: alta atomica via invite. Jugador queda status=approved directo (admin ya valido al invitar). Ratings 1/1/1 hasta que admin proponga + veedor apruebe via update_sensitive_fields.';
