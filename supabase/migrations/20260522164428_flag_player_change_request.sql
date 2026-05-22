-- ============================================================================
-- FUT-22: flag_player_change_request
-- ============================================================================
--
-- Plan v4 seccion 2: marca un request como 'flagged' para indicar que
-- necesita revision adicional (segunda opinion de otro veedor, o que el
-- requester revise/corrija). No aplica el cambio ni lo cierra: el request
-- sigue siendo elegible para approve/reject (ambas funciones aceptan status
-- IN ('pending','flagged')).
--
-- Diferencia con reject (FUT-21):
--   - reject cierra el request (status='rejected', inmutable luego por FUT-25).
--   - flag deja el request abierto pero marcado. Otro veedor (o el mismo)
--     puede luego decidir.
--
-- Source state valido: solo 'pending'. Flag-ear un 'flagged' es no-op y un
-- 'approved'/'rejected' no tiene sentido. La constraint decided_needs_reviewer
-- de FUT-17 obliga a setear reviewed_by/reviewed_at al pasar a flagged.
--
-- Estructura de validaciones identica a reject:
--   1. Auth.
--   2. Cargar request con FOR UPDATE.
--   3. Caller debe ser veedor.
--   4. Status debe ser 'pending'.
--   5. requested_by != caller.
--   6. UPDATE request: status='flagged', reviewed_by, reviewed_at, comment.
--   7. INSERT audit_log.
--
-- Error codes:
--   P0001 auth_required
--   P0002 request_not_found
--   P0003 not_a_veedor
--   P0004 invalid_status        (no es 'pending')
--   P0005 cannot_flag_own_request
-- ============================================================================

create or replace function public.flag_player_change_request(
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

  -- Solo 'pending' es flag-eable. 'flagged' ya esta marcado y los estados
  -- decididos (approved/rejected) son inmutables (FUT-25).
  if v_request.status <> 'pending' then
    raise exception 'invalid_status' using errcode = 'P0004';
  end if;

  if v_request.requested_by = v_caller_id then
    raise exception 'cannot_flag_own_request' using errcode = 'P0005';
  end if;

  -- Session var: permite que el trigger de inmutabilidad post-decision
  -- (FUT-25) acepte la transicion pending -> flagged.
  perform set_config('app.applying_change_request', 'true', true);

  update public.player_change_requests
  set
    status         = 'flagged',
    reviewed_by    = v_caller_id,
    reviewed_at    = now(),
    review_comment = p_comment
  where id = p_request_id;

  insert into public.audit_log (actor_id, entity, entity_id, action, payload)
  values (
    v_caller_id,
    'player_change_request',
    p_request_id,
    'flag_change_request',
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

comment on function public.flag_player_change_request(uuid, text) is
  'Plan v4 FUT-22. Marca un player_change_request como flagged (necesita revision adicional). El request sigue abierto: approve/reject aceptan status flagged. Audit_log queda con action=flag_change_request.';

revoke all on function public.flag_player_change_request(uuid, text) from public;
grant execute on function public.flag_player_change_request(uuid, text) to authenticated;
