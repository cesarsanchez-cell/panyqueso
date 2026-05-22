-- ============================================================================
-- FUT-29: RLS policies de convocatorias / matches y tablas relacionadas
-- ============================================================================
--
-- Plan v4 seccion 6:
--   convocatorias, matches, match_teams, match_team_players, match_player_stats:
--     SELECT: admin + veedor.
--     INSERT/UPDATE: solo admin.
--     DELETE: bloqueado.
--
-- convocatoria_players sigue el mismo patron (es parte del modelo de
-- convocatorias).
--
-- DELETE bloqueado para preservar la historia: una vez creada una
-- convocatoria o partido, no se borran. Se cancelan (status='cancelada') o
-- quedan archivadas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. convocatorias
-- ---------------------------------------------------------------------------
create policy convocatorias_select_admin_veedor
  on public.convocatorias
  for select
  to authenticated
  using (public.current_user_role() in ('admin', 'veedor'));

create policy convocatorias_insert_admin
  on public.convocatorias
  for insert
  to authenticated
  with check (public.current_user_role() = 'admin');

create policy convocatorias_update_admin
  on public.convocatorias
  for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- 2. convocatoria_players
-- ---------------------------------------------------------------------------
create policy convocatoria_players_select_admin_veedor
  on public.convocatoria_players
  for select
  to authenticated
  using (public.current_user_role() in ('admin', 'veedor'));

create policy convocatoria_players_insert_admin
  on public.convocatoria_players
  for insert
  to authenticated
  with check (public.current_user_role() = 'admin');

create policy convocatoria_players_update_admin
  on public.convocatoria_players
  for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- 3. matches
-- ---------------------------------------------------------------------------
create policy matches_select_admin_veedor
  on public.matches
  for select
  to authenticated
  using (public.current_user_role() in ('admin', 'veedor'));

create policy matches_insert_admin
  on public.matches
  for insert
  to authenticated
  with check (public.current_user_role() = 'admin');

create policy matches_update_admin
  on public.matches
  for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- 4. match_teams
-- ---------------------------------------------------------------------------
create policy match_teams_select_admin_veedor
  on public.match_teams
  for select
  to authenticated
  using (public.current_user_role() in ('admin', 'veedor'));

create policy match_teams_insert_admin
  on public.match_teams
  for insert
  to authenticated
  with check (public.current_user_role() = 'admin');

create policy match_teams_update_admin
  on public.match_teams
  for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- 5. match_team_players
-- ---------------------------------------------------------------------------
create policy match_team_players_select_admin_veedor
  on public.match_team_players
  for select
  to authenticated
  using (public.current_user_role() in ('admin', 'veedor'));

create policy match_team_players_insert_admin
  on public.match_team_players
  for insert
  to authenticated
  with check (public.current_user_role() = 'admin');

create policy match_team_players_update_admin
  on public.match_team_players
  for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- 6. match_player_stats
-- ---------------------------------------------------------------------------
create policy match_player_stats_select_admin_veedor
  on public.match_player_stats
  for select
  to authenticated
  using (public.current_user_role() in ('admin', 'veedor'));

create policy match_player_stats_insert_admin
  on public.match_player_stats
  for insert
  to authenticated
  with check (public.current_user_role() = 'admin');

create policy match_player_stats_update_admin
  on public.match_player_stats
  for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- DELETE: sin policies en ninguna tabla. RLS bloquea = no se puede borrar.
-- Cancelaciones via status='cancelada' (convocatorias) o dejando el row.
-- ---------------------------------------------------------------------------
