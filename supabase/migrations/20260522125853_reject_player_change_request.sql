-- ============================================================================
-- FUT-21: reject_player_change_request
-- ============================================================================
--
-- Plan v4 seccion 2: rechaza una propuesta sin tocar players.
--
-- Comparada con approve (FUT-20) esta funcion es mucho mas simple:
--   - No hay aplicacion de cambio.
--   - No hay staleness check (nada que aplicar).
--   - Solo marca el request como rejected y escribe audit_log.
--
-- Misma estructura de validaciones que approve:
--   1. Auth.
--   2. Cargar request con FOR UPDATE.
--   3. Caller debe ser veedor.
--   4. Status debe ser pending o flagged.
--   5. requested_by != caller.
--   6. UPDATE request: status='rejected', reviewed_by, reviewed_at, comment.
--   7. INSERT audit_log.
--
-- review_comment es opcional a nivel SQL. La UI puede exigirlo (FUT-39).
--
-- Error codes (mismo esquema que approve):
--   P0001 auth_required
--   P0002 request_not_found
--   P0003 not_a_veedor
--   P0004 invalid_status
--   P0005 cannot_reject_own_request
-- ============================================================================

create or replace function public.reject_player_change_request(
  p_request_id uuid,
  p_comment    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id   uuid;
  v_caller_role public.user_role;
  v_request     public.player_change_requests;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'auth_required' using errcode = 'P0001';
  end if;

  select * into v_request
  from public.player_change_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  select role into v_caller_role
  from public.profiles
  where id = v_caller_id;

  if v_caller_role is null or v_caller_role <> 'veedor' then
    raise exception 'not_a_veedor' using errcode = 'P0003';
  end if;

  if v_request.status not in ('pending', 'flagged') then
    raise exception 'invalid_status' using errcode = 'P0004';
  end if;

  if v_request.requested_by = v_caller_id then
    raise exception 'cannot_reject_own_request' using errcode = 'P0005';
  end if;

  -- Marca el request como rejected. La session var permite que el trigger
  -- de inmutabilidad post-decision (FUT-25) acepte esta transicion.
  perform set_config('app.applying_change_request', 'true', true);

  update public.player_change_requests
  set
    status         = 'rejected',
    reviewed_by    = v_caller_id,
    reviewed_at    = now(),
    review_comment = p_comment
  where id = p_request_id;

  -- Auditoria: snapshot suficiente para reconstruir la decision.
  insert into public.audit_log (actor_id, entity, entity_id, action, payload)
  values (
    v_caller_id,
    'player_change_request',
    p_request_id,
    'reject_change_request',
    jsonb_build_object(
      'action_type',     v_request.action_type,
      'player_id',       v_request.player_id,
      'requested_by',    v_request.requested_by,
      'proposed_values', v_request.proposed_values,
      'comment',         p_comment
    )
  );
end;
$$;

comment on function public.reject_player_change_request(uuid, text) is
  'Plan v4 FUT-21. Rechaza un player_change_request sin tocar players. Misma estructura de validaciones que approve (FUT-20). Audit_log queda con action=reject_change_request.';

revoke all on function public.reject_player_change_request(uuid, text) from public;
grant execute on function public.reject_player_change_request(uuid, text) to authenticated;
