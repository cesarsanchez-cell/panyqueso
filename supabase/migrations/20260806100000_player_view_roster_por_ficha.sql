-- ============================================================================
-- La vista de jugador se gatea por FICHA, no por rol = 'player' (parte 2: roster)
-- ============================================================================
--
-- Continuación de 20260805100000. Ese fix re-gateó por current_player_id() las
-- policies "self" (grupos, grupo_membresias propia, convocatoria propia), pero
-- quedaron 3 policies de la vista de jugador todavía gateadas por
-- current_user_role() = 'player'. Son justo las que muestran el ROSTER y la
-- convocatoria del grupo, así que un coordinador/veedor que TAMBIÉN juega
-- (rol 'coordinador' porque gestiona otros grupos, con ficha y miembro de este)
-- veía su grupo pero:
--   - como "único titular de N" (solo su propia fila del roster), sin el resto;
--   - sin la convocatoria completa del grupo si no tenía fila propia.
--
-- Causa: las 3 policies exigen rol 'player'. El principio correcto (igual que en
-- 20260805100000) es gatear por la FICHA. Los helpers que ya usan estas policies
-- (is_member_of_conv_grupo, has_any_membership_in_grupo) resuelven la membresía
-- con current_player_id() adentro, que es SECURITY DEFINER y devuelve NULL si el
-- caller no tiene ficha. Así que basta con SACAR el predicado de rol y apoyarse
-- en el helper: un coordinador/veedor PURO (sin ficha) sigue sin ganar acceso.
--
-- También se elimina convocatorias_select_player_invited (creada en
-- 20260805100000): la policy de convocatorias por pertenencia al grupo, ya
-- ficha-based, la cubre por completo (member-of-grupo ⊇ invited para un miembro
-- real; los invitados libres tienen player_id NULL). Evita dos policies
-- solapadas sobre la misma tabla.
-- ============================================================================

-- 1. convocatorias: el caller con ficha ve las convocatorias de los grupos donde
--    es/fue miembro (no solo donde tiene fila). is_member_of_conv_grupo usa
--    current_player_id() → ficha. (Reemplaza la versión rol-gated de FUT-113 y
--    deja sin uso a convocatorias_select_player_invited.)
drop policy if exists convocatorias_select_player_invited on public.convocatorias;
drop policy if exists convocatorias_select_player_member_of_grupo on public.convocatorias;
create policy convocatorias_select_player_member_of_grupo
  on public.convocatorias
  for select
  to authenticated
  using (public.is_member_of_conv_grupo(public.convocatorias.id));

comment on policy convocatorias_select_player_member_of_grupo on public.convocatorias is
  'El caller con ficha (cualquier rol) ve las convocatorias de los grupos donde es/fue miembro. Gateado por current_player_id() vía is_member_of_conv_grupo, no por rol. Arregla al coordinador/veedor que juega.';

-- 2. convocatoria_players: el caller con ficha ve el ROSTER completo de cualquier
--    convocatoria de un grupo donde es/fue miembro (así ve a todos los anotados,
--    no solo su propia fila). Era el bug "único titular de N".
drop policy if exists convocatoria_players_select_player_member_of_grupo on public.convocatoria_players;
create policy convocatoria_players_select_player_member_of_grupo
  on public.convocatoria_players
  for select
  to authenticated
  using (public.is_member_of_conv_grupo(public.convocatoria_players.convocatoria_id));

comment on policy convocatoria_players_select_player_member_of_grupo on public.convocatoria_players is
  'El caller con ficha (cualquier rol) ve el roster completo de las convocatorias de los grupos donde es/fue miembro. Gateado por current_player_id() vía is_member_of_conv_grupo, no por rol. Arregla el roster que se veía como "único titular de N" para el coordinador/veedor que juega.';

-- 3. grupo_membresias: el caller con ficha ve las filas ACTIVAS de los grupos
--    donde tuvo cualquier membresía (para ver co-miembros). has_any_membership_in_grupo
--    usa current_player_id() → ficha.
drop policy if exists grupo_membresias_select_player_was_member on public.grupo_membresias;
create policy grupo_membresias_select_player_was_member
  on public.grupo_membresias
  for select
  to authenticated
  using (
    status = 'activo'
    and public.has_any_membership_in_grupo(public.grupo_membresias.grupo_id)
  );

comment on policy grupo_membresias_select_player_was_member on public.grupo_membresias is
  'El caller con ficha (cualquier rol) ve las filas activas de los grupos donde tuvo cualquier membresía (co-miembros). Gateado por current_player_id() vía has_any_membership_in_grupo, no por rol.';
