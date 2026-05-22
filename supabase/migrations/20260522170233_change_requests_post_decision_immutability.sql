-- ============================================================================
-- FUT-25: trigger de inmutabilidad post-decision en player_change_requests
-- ============================================================================
--
-- Defense in depth en UPDATE. Una vez que un request fue approved o rejected,
-- el row queda congelado. Aun los pending/flagged solo pueden mutar via las
-- funciones SECURITY DEFINER (approve/reject/flag), que setean la session var
-- app.applying_change_request='true'.
--
-- Tres categorias:
--
--   1. IDENTIDAD/PAYLOAD: inmutables SIEMPRE, incluso desde approve.
--        id, created_at, requested_by, action_type, player_id,
--        proposed_values, old_values, fields_changed, reason
--      Estos forman la propuesta original. Ningun flujo legitimo necesita
--      cambiarlos despues de creado el request.
--
--   2. ESTADOS TERMINALES: approved y rejected son finales.
--      Si OLD.status in ('approved','rejected') => cualquier UPDATE falla.
--
--   3. CAMPOS DE DECISION: status, reviewed_by, reviewed_at, review_comment,
--      created_player_id. Mutables solo cuando viene de una funcion SECURITY
--      DEFINER (session var = 'true').
--
-- Error codes:
--   P0020 change_request_finalized              OLD.status es terminal
--   P0021 change_request_field_immutable        identidad/payload cambio (detail = field)
--   P0022 change_request_unauthorized_update    decision cambio sin session var (detail = field)
-- ============================================================================

create or replace function public.player_change_requests_enforce_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_applying text;
begin
  -- 1. Identidad / payload: nunca mutables.
  if new.id is distinct from old.id then
    raise exception 'change_request_field_immutable'
      using errcode = 'P0021', detail = 'id';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'change_request_field_immutable'
      using errcode = 'P0021', detail = 'created_at';
  end if;
  if new.requested_by is distinct from old.requested_by then
    raise exception 'change_request_field_immutable'
      using errcode = 'P0021', detail = 'requested_by';
  end if;
  if new.action_type is distinct from old.action_type then
    raise exception 'change_request_field_immutable'
      using errcode = 'P0021', detail = 'action_type';
  end if;
  if new.player_id is distinct from old.player_id then
    raise exception 'change_request_field_immutable'
      using errcode = 'P0021', detail = 'player_id';
  end if;
  if new.proposed_values is distinct from old.proposed_values then
    raise exception 'change_request_field_immutable'
      using errcode = 'P0021', detail = 'proposed_values';
  end if;
  if new.old_values is distinct from old.old_values then
    raise exception 'change_request_field_immutable'
      using errcode = 'P0021', detail = 'old_values';
  end if;
  if new.fields_changed is distinct from old.fields_changed then
    raise exception 'change_request_field_immutable'
      using errcode = 'P0021', detail = 'fields_changed';
  end if;
  if new.reason is distinct from old.reason then
    raise exception 'change_request_field_immutable'
      using errcode = 'P0021', detail = 'reason';
  end if;

  -- 2. Estados terminales: approved y rejected son finales para siempre.
  if old.status in ('approved', 'rejected') then
    raise exception 'change_request_finalized'
      using errcode = 'P0020';
  end if;

  -- 3. Campos de decision: mutables solo desde approve/reject/flag.
  v_applying := current_setting('app.applying_change_request', true);
  if v_applying = 'true' then
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'change_request_unauthorized_update'
      using errcode = 'P0022', detail = 'status';
  end if;
  if new.reviewed_by is distinct from old.reviewed_by then
    raise exception 'change_request_unauthorized_update'
      using errcode = 'P0022', detail = 'reviewed_by';
  end if;
  if new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'change_request_unauthorized_update'
      using errcode = 'P0022', detail = 'reviewed_at';
  end if;
  if new.review_comment is distinct from old.review_comment then
    raise exception 'change_request_unauthorized_update'
      using errcode = 'P0022', detail = 'review_comment';
  end if;
  if new.created_player_id is distinct from old.created_player_id then
    raise exception 'change_request_unauthorized_update'
      using errcode = 'P0022', detail = 'created_player_id';
  end if;

  return new;
end;
$$;

comment on function public.player_change_requests_enforce_immutability() is
  'Plan v4 FUT-25. Defense in depth: bloquea UPDATE de identidad/payload siempre, marca approved/rejected como terminales y exige session var app.applying_change_request=true para mutar status/reviewed_*/created_player_id.';

revoke all on function public.player_change_requests_enforce_immutability() from public;

create trigger player_change_requests_block_post_decision_updates
  before update on public.player_change_requests
  for each row
  execute function public.player_change_requests_enforce_immutability();
