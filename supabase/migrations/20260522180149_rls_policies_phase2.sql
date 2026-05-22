-- ============================================================================
-- FUT-26: RLS policies de Fase 2 (profiles UPDATE, players UPDATE,
--         player_change_requests CRUD)
-- ============================================================================
--
-- Cierre del modelo RLS de Fase 2. audit_log ya quedo cerrado en FUT-18 y
-- profiles ya tiene SELECT en FUT-9; aca agregamos lo que faltaba.
--
-- Estrategia general:
--   - Column-level GRANT para limitar columnas mutables sin depender solo de
--     triggers. Defense in depth: primero el GRANT bloquea, despues el trigger
--     valida.
--   - current_user_role() (FUT-9) sigue siendo el helper SECURITY DEFINER
--     para evitar recursion al leer profiles.
--
-- Resumen por tabla:
--
-- profiles
--   UPDATE: cada user puede editar SU nombre. El role queda inalterable
--           desde la API (asignacion manual via SQL editor segun plan v4).
--
-- players
--   UPDATE: admin puede tocar private_notes. El trigger
--           players_block_sensitive_updates (FUT-23) sigue siendo backup
--           contra escritura de sensibles. Los campos sensibles solo cambian
--           via approve_player_change_request (SECURITY DEFINER).
--
-- player_change_requests
--   SELECT: admin ve solo SUS requests; veedor ve todos.
--   INSERT: admin con requested_by = auth.uid(). El trigger FUT-24 tambien
--           lo fuerza, pero defense in depth.
--   UPDATE/DELETE: sin policy => bloqueado a clientes. Solo via approve /
--                  reject / flag (SECURITY DEFINER).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------------

-- Column-level GRANT: solo nombre es mutable por el cliente. Esto impide
-- que un usuario se auto-asigne role='admin' aun si la policy lo dejara.
revoke update on public.profiles from authenticated;
grant update (nombre) on public.profiles to authenticated;

create policy profiles_update_self_nombre
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 2. players
-- ---------------------------------------------------------------------------

-- Column-level GRANT: solo private_notes (campos "libres" segun FUT-23).
-- Los sensibles solo se modifican via approve_player_change_request, que
-- corre como SECURITY DEFINER (rol postgres con todos los privilegios).
revoke update on public.players from authenticated;
grant update (private_notes) on public.players to authenticated;

create policy players_update_admin_notes
  on public.players
  for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- 3. player_change_requests
-- ---------------------------------------------------------------------------

-- SELECT: admin ve solo sus propias propuestas (privacidad: no necesita ver
-- las propuestas de otro admin). Veedor ve todo para poder revisar.
create policy player_change_requests_select_own_admin
  on public.player_change_requests
  for select
  to authenticated
  using (
    public.current_user_role() = 'admin'
    and requested_by = auth.uid()
  );

create policy player_change_requests_select_all_veedor
  on public.player_change_requests
  for select
  to authenticated
  using (public.current_user_role() = 'veedor');

-- INSERT: admin con requested_by = auth.uid(). El trigger FUT-24 sobreescribe
-- requested_by con auth.uid() antes de esta verificacion (orden: BEFORE
-- triggers -> CHECK constraints -> RLS WITH CHECK), asi que ambos coinciden.
create policy player_change_requests_insert_admin
  on public.player_change_requests
  for insert
  to authenticated
  with check (
    public.current_user_role() = 'admin'
    and requested_by = auth.uid()
  );

-- UPDATE / DELETE: SIN policies => bloqueado a clientes. La unica via legitima
-- de mutacion son las funciones SECURITY DEFINER de FUT-20/21/22 que bypassean
-- RLS al correr como postgres.

-- ---------------------------------------------------------------------------
-- 4. audit_log: ya cerrado en FUT-18. No se modifica aca.
-- ---------------------------------------------------------------------------
