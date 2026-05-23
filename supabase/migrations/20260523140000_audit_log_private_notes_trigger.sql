-- ============================================================================
-- AUDIT FASE 3 - Major 1: trigger de auditoria para private_notes
-- ============================================================================
--
-- private_notes es un campo no sensible y editable directo por el admin
-- (RLS players_update_admin_notes + column GRANT en FUT-26 + actions.ts
-- updatePrivateNotes). El cambio no quedaba registrado.
--
-- Solucion: trigger AFTER UPDATE OF private_notes que inserta una linea en
-- audit_log con actor + old/new. SECURITY DEFINER porque audit_log tiene
-- INSERT bloqueado para clientes (la unica via legitima de insercion son
-- funciones SECURITY DEFINER, ver FUT-18).
--
-- Filtros:
--   - Column-list trigger (OF private_notes): solo se evalua si la columna
--     aparece en el SET del UPDATE.
--   - WHEN (new IS DISTINCT FROM old): evita logs espurios si el cliente
--     manda el mismo valor.
--
-- INSERT inicial via approve_player_change_request (create_player) NO
-- dispara este trigger (es INSERT, no UPDATE).
-- ============================================================================

create or replace function public.players_log_private_notes_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor_id, entity, entity_id, action, payload)
  values (
    auth.uid(),
    'player',
    new.id,
    'update_private_notes',
    jsonb_build_object(
      'old', old.private_notes,
      'new', new.private_notes
    )
  );
  return null;
end;
$$;

comment on function public.players_log_private_notes_change() is
  'Audit Fase 3 Major 1: registra en audit_log toda mutacion de private_notes (actor + old/new). SECURITY DEFINER para sortear RLS de audit_log.';

revoke all on function public.players_log_private_notes_change() from public;

create trigger players_log_private_notes
  after update of private_notes on public.players
  for each row
  when (new.private_notes is distinct from old.private_notes)
  execute function public.players_log_private_notes_change();
