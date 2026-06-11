-- ============================================================================
-- FUT-107d (Fase 11, Bloque 2, 2b — Membresías + Invitaciones): rescopear RLS
-- ============================================================================
--
-- grupo_membresias y player_invitations tienen grupo_id DIRECTO, así que el
-- rescope usa can_manage_grupo(grupo_id) sin helper intermedio.
--
--   grupo_membresias  → el coordinador suma/saca (status='inactivo') y promueve
--                       miembros de SU grupo.
--   player_invitations → el coordinador invita y cancela/extiende invitaciones
--                       de SU grupo.
--
-- Solo se tocan las policies ADMIN. Las policies SELECT del JUGADOR
-- (grupo_membresias_select_player / _self_player / _player_was_member) quedan
-- intactas. No hay riesgo de recursión: can_manage_grupo es SECURITY DEFINER y
-- solo consulta coordinador_grupos (ninguna policy referencia esa tabla).
--
-- player_invitations.INSERT seguía siendo admin O veedor (los dos invitaban):
-- se preserva al veedor y se agrega al coordinador del grupo.
--
-- Los flujos del JUGADOR (claim/decline/rejoin/one-click) son funciones
-- SECURITY DEFINER sin gate admin → no se tocan. La capa app (requireRole) es 2c.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. grupo_membresias
-- ----------------------------------------------------------------------------
drop policy if exists grupo_membresias_select_admin_veedor on public.grupo_membresias;
create policy grupo_membresias_select_admin_veedor
  on public.grupo_membresias
  for select
  to authenticated
  using (
    public.current_user_role() in ('admin', 'veedor')
    or public.can_manage_grupo(grupo_id)
  );

drop policy if exists grupo_membresias_insert_admin on public.grupo_membresias;
create policy grupo_membresias_insert_grupo
  on public.grupo_membresias
  for insert
  to authenticated
  with check (public.can_manage_grupo(grupo_id));

drop policy if exists grupo_membresias_update_admin on public.grupo_membresias;
create policy grupo_membresias_update_grupo
  on public.grupo_membresias
  for update
  to authenticated
  using (public.can_manage_grupo(grupo_id))
  with check (public.can_manage_grupo(grupo_id));

-- ----------------------------------------------------------------------------
-- 2. player_invitations
-- ----------------------------------------------------------------------------
drop policy if exists player_invitations_select_admin_veedor on public.player_invitations;
create policy player_invitations_select_admin_veedor
  on public.player_invitations
  for select
  to authenticated
  using (
    public.current_user_role() in ('admin', 'veedor')
    or public.can_manage_grupo(grupo_id)
  );

-- INSERT: admin/coordinador del grupo (can_manage_grupo) o veedor (preserva el
-- comportamiento original: el veedor también podía invitar).
drop policy if exists player_invitations_insert_admin_veedor on public.player_invitations;
create policy player_invitations_insert_grupo
  on public.player_invitations
  for insert
  to authenticated
  with check (
    public.current_user_role() = 'veedor'
    or public.can_manage_grupo(grupo_id)
  );

drop policy if exists player_invitations_update_admin on public.player_invitations;
create policy player_invitations_update_grupo
  on public.player_invitations
  for update
  to authenticated
  using (public.can_manage_grupo(grupo_id))
  with check (public.can_manage_grupo(grupo_id));

-- DELETE sigue bloqueado en ambas tablas (sin policy). La historia no se borra.
