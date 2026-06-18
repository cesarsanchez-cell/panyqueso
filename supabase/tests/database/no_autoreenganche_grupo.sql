-- ============================================================================
-- Test: player_join_suplente_queue queda sin execute para authenticated
-- (el auto-reenganche del jugador al grupo está deshabilitado).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

select plan(1);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.player_join_suplente_queue(uuid)',
    'EXECUTE'
  ),
  'player_join_suplente_queue: sin EXECUTE para authenticated (no auto-reenganche)'
);

select * from finish();
rollback;
