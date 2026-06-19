-- ============================================================================
-- La vista de jugador se gatea por FICHA, no por rol = 'player'
-- ============================================================================
--
-- Bug: un coordinador/veedor que TAMBIÉN juega (tiene ficha) y es miembro de un
-- grupo que NO gestiona pierde, en su vista de jugador, la lectura del grupo /
-- convocatoria / su propia membresía. Se nota al sacarle el rango de coordinador
-- de UN grupo cuando coordina otros: su rol queda 'coordinador' (no vuelve a
-- 'player'), sigue siendo miembro, pero el grupo desaparece de su vista y la
-- pantalla rompe donde se asume que el grupo existe.
--
-- Causa: las 4 policies SELECT "self player" estaban gateadas por
-- current_user_role() = 'player', que excluye a quien tiene rol coordinador/
-- veedor/admin aunque tenga ficha. El principio correcto (ya usado en otras
-- partes, p.ej. players_public en 20260723) es gatear por current_player_id()
-- (la FICHA), no por el rol.
--
-- Fix: recrear las 4 policies usando current_player_id(). Son SELECT y combinan
-- con OR → solo AMPLÍAN el acceso a quien es su propio miembro/invitado; no
-- exponen nada a no-miembros. current_player_id() es SECURITY DEFINER y devuelve
-- NULL si el caller no tiene ficha (un coordinador/veedor PURO no gana acceso).
-- ============================================================================

-- 1. convocatoria_players: el caller con ficha ve sus propias filas.
drop policy if exists convocatoria_players_select_self_player on public.convocatoria_players;
create policy convocatoria_players_select_self_player
  on public.convocatoria_players
  for select
  to authenticated
  using (player_id = public.current_player_id());

comment on policy convocatoria_players_select_self_player on public.convocatoria_players is
  'El caller con ficha (cualquier rol) ve su propia invitación a una convocatoria. Gateado por current_player_id(), no por rol.';

-- 2. convocatorias: el caller con ficha ve las convocatorias donde está invitado.
drop policy if exists convocatorias_select_player_invited on public.convocatorias;
create policy convocatorias_select_player_invited
  on public.convocatorias
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.convocatoria_players cp
       where cp.convocatoria_id = public.convocatorias.id
         and cp.player_id = public.current_player_id()
    )
  );

comment on policy convocatorias_select_player_invited on public.convocatorias is
  'El caller con ficha (cualquier rol) ve las convocatorias donde fue invitado. Gateado por current_player_id(), no por rol.';

-- 3. grupo_membresias: el caller con ficha ve todas sus propias membresías.
drop policy if exists grupo_membresias_select_self_player on public.grupo_membresias;
create policy grupo_membresias_select_self_player
  on public.grupo_membresias
  for select
  to authenticated
  using (player_id = public.current_player_id());

comment on policy grupo_membresias_select_self_player on public.grupo_membresias is
  'El caller con ficha (cualquier rol) ve todas sus propias membresías (activas e inactivas). Gateado por current_player_id(), no por rol.';

-- 4. grupos: el caller con ficha ve los grupos donde es/fue miembro.
drop policy if exists grupos_select_player_any_membership on public.grupos;
create policy grupos_select_player_any_membership
  on public.grupos
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.grupo_membresias gm
       where gm.grupo_id = public.grupos.id
         and gm.player_id = public.current_player_id()
    )
  );

comment on policy grupos_select_player_any_membership on public.grupos is
  'El caller con ficha (cualquier rol) ve los grupos donde es/fue miembro. Gateado por current_player_id(), no por rol. Arregla el coordinador/veedor que juega y es miembro de un grupo que no gestiona.';
