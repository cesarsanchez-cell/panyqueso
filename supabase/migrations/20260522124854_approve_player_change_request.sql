-- ============================================================================
-- FUT-20: approve_player_change_request
-- ============================================================================
--
-- LA funcion critica de Fase 2. Es la unica via permitida para mutar campos
-- sensibles de un player. Atomica, SECURITY DEFINER, defense in depth
-- (CHECK + RLS + funcion).
--
-- Plan v4 seccion 2:
--   1. Carga request con FOR UPDATE.
--   2. Verifica que el caller es veedor (lookup en profiles por auth.uid()).
--   3. Verifica request.status IN ('pending','flagged').
--   4. Verifica request.requested_by <> auth.uid().
--   5. Segun action_type:
--        - create_player: INSERT en players con proposed_values. Guarda el
--          nuevo id en request.created_player_id.
--        - update_sensitive_fields: staleness check (old_values vs valores
--          actuales) -> stale_request si difiere. UPDATE solo los campos
--          presentes en proposed_values.
--        - deactivate_player / reactivate_player: UPDATE status.
--   6. UPDATE request: status='approved', reviewed_by, reviewed_at, comment.
--   7. INSERT audit_log con snapshot del cambio.
--   8. Todo en una sola transaccion.
--
-- Session var app.applying_change_request='true':
--   Los triggers de inmutabilidad de FUT-23 (players) y FUT-25
--   (player_change_requests) van a chequear esta var para permitir el cambio
--   solo cuando viene de esta funcion. Aca la seteamos antes de modificar.
--
-- Error codes (P0001-P0008):
--   auth_required               P0001  no hay sesion
--   request_not_found           P0002
--   not_a_veedor                P0003  caller no tiene role='veedor'
--   invalid_status              P0004  status no es pending/flagged
--   cannot_approve_own_request  P0005  reviewer = requester
--   player_not_found            P0006  el player de update_sensitive_fields no existe
--   stale_request               P0007  old_values no coincide con actual (detail trae el campo)
--   unknown_action_type         P0008
-- ============================================================================

create or replace function public.approve_player_change_request(
  p_request_id uuid,
  p_comment    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id     uuid;
  v_caller_role   public.user_role;
  v_request       public.player_change_requests;
  v_player_json   jsonb;
  v_proposed      jsonb;
  v_old           jsonb;
  v_key           text;
  v_old_value     text;
  v_new_player_id uuid;
begin
  -- 0. Auth ----------------------------------------------------------------
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'auth_required' using errcode = 'P0001';
  end if;

  -- 1. Cargar request con lock --------------------------------------------
  select * into v_request
  from public.player_change_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  -- 2. Rol del caller ------------------------------------------------------
  select role into v_caller_role
  from public.profiles
  where id = v_caller_id;

  if v_caller_role is null or v_caller_role <> 'veedor' then
    raise exception 'not_a_veedor' using errcode = 'P0003';
  end if;

  -- 3. Estado del request -------------------------------------------------
  if v_request.status not in ('pending', 'flagged') then
    raise exception 'invalid_status' using errcode = 'P0004';
  end if;

  -- 4. Reviewer != Requester ----------------------------------------------
  if v_request.requested_by = v_caller_id then
    raise exception 'cannot_approve_own_request' using errcode = 'P0005';
  end if;

  -- 5. Aplicar segun action_type ------------------------------------------
  -- Marcar la transaccion como "viniendo de approve" para que los triggers
  -- de inmutabilidad (FUT-23, 25) permitan los UPDATE/INSERT subsiguientes.
  perform set_config('app.applying_change_request', 'true', true);

  v_proposed := v_request.proposed_values;

  if v_request.action_type = 'create_player' then
    insert into public.players (
      nombre, edad, role_field, position_pref, positions_possible,
      technical, physical, mental, rating_confidence,
      private_notes, status, created_by
    )
    values (
      v_proposed->>'nombre',
      (v_proposed->>'edad')::int,
      (v_proposed->>'role_field')::public.player_role_field,
      (v_proposed->>'position_pref')::public.position_pref,
      coalesce(
        (select array_agg(value::public.position_pref)
         from jsonb_array_elements_text(v_proposed->'positions_possible')),
        '{}'::public.position_pref[]
      ),
      (v_proposed->>'technical')::int,
      (v_proposed->>'physical')::int,
      (v_proposed->>'mental')::int,
      coalesce((v_proposed->>'rating_confidence')::public.rating_confidence, 'baja'),
      v_proposed->>'private_notes',
      'approved',
      v_request.requested_by
    )
    returning id into v_new_player_id;

  elsif v_request.action_type = 'update_sensitive_fields' then
    -- Staleness check: si old_values esta presente, cada key del json debe
    -- coincidir con el valor actual del player. Si no, alguien modifico el
    -- player entre que se propuso y se va a aprobar.
    if v_request.old_values is not null then
      select to_jsonb(p.*) into v_player_json
      from public.players p
      where p.id = v_request.player_id
      for update;

      if v_player_json is null then
        raise exception 'player_not_found' using errcode = 'P0006';
      end if;

      v_old := v_request.old_values;
      for v_key, v_old_value in
        select * from jsonb_each_text(v_old)
      loop
        if (v_player_json->>v_key) is distinct from v_old_value then
          raise exception 'stale_request'
            using errcode = 'P0007',
                  detail  = format('field %s changed', v_key);
        end if;
      end loop;
    end if;

    -- Aplicar solo los campos presentes en proposed_values. Lo demas se
    -- conserva via coalesce con la columna actual.
    update public.players
    set
      edad              = coalesce((v_proposed->>'edad')::int, edad),
      status            = coalesce((v_proposed->>'status')::public.player_status, status),
      role_field        = coalesce((v_proposed->>'role_field')::public.player_role_field, role_field),
      position_pref     = coalesce((v_proposed->>'position_pref')::public.position_pref, position_pref),
      technical         = coalesce((v_proposed->>'technical')::int, technical),
      physical          = coalesce((v_proposed->>'physical')::int, physical),
      mental            = coalesce((v_proposed->>'mental')::int, mental),
      rating_confidence = coalesce((v_proposed->>'rating_confidence')::public.rating_confidence, rating_confidence)
    where id = v_request.player_id;

  elsif v_request.action_type = 'deactivate_player' then
    update public.players set status = 'inactive' where id = v_request.player_id;

  elsif v_request.action_type = 'reactivate_player' then
    update public.players set status = 'approved' where id = v_request.player_id;

  else
    raise exception 'unknown_action_type' using errcode = 'P0008';
  end if;

  -- 6. Marcar el request como approved ------------------------------------
  update public.player_change_requests
  set
    status            = 'approved',
    reviewed_by       = v_caller_id,
    reviewed_at       = now(),
    review_comment    = p_comment,
    created_player_id = case
      when v_request.action_type = 'create_player' then v_new_player_id
      else created_player_id
    end
  where id = p_request_id;

  -- 7. Auditoria -----------------------------------------------------------
  insert into public.audit_log (actor_id, entity, entity_id, action, payload)
  values (
    v_caller_id,
    'player_change_request',
    p_request_id,
    'approve_change_request',
    jsonb_build_object(
      'action_type',     v_request.action_type,
      'player_id',       coalesce(v_new_player_id, v_request.player_id),
      'requested_by',    v_request.requested_by,
      'old_values',      v_request.old_values,
      'proposed_values', v_request.proposed_values,
      'comment',         p_comment
    )
  );
end;
$$;

comment on function public.approve_player_change_request(uuid, text) is
  'Plan v4 FUT-20. Unica via para mutar campos sensibles de players. SECURITY DEFINER, atomica. Valida rol veedor, estado pending/flagged, reviewer != requester, staleness. Aplica el cambio segun action_type, marca el request como approved, escribe audit_log.';

-- Permisos: solo authenticated puede llamarla. La validacion fina de rol
-- (veedor) la hace la funcion internamente con auth.uid() -> profile.role.
revoke all on function public.approve_player_change_request(uuid, text) from public;
grant execute on function public.approve_player_change_request(uuid, text) to authenticated;
