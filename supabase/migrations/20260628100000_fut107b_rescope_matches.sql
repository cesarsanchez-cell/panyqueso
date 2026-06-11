-- ============================================================================
-- FUT-107b (Fase 11, Bloque 2, 2b — dominio Partido): rescopear RLS de matches
-- ============================================================================
--
-- Mismo patrón que convocatorias (FUT-107a): reemplaza el "es admin" por
-- can_manage_grupo(grupo) en las policies de escritura de las 4 tablas del
-- partido, y agrega al coordinador en las de lectura. Así el coordinador opera
-- el partido de SU grupo (confirmar equipos, cargar resultado/goles/stats), y
-- NO el de otros grupos.
--
--   - Escritura (insert/update): admin (todos) o coordinador del grupo.
--   - Lectura: admin + veedor (todo) o coordinador de ese grupo.
--   - DELETE sigue bloqueado (sin policy) para preservar la historia.
--
-- Cadena de grupo (ninguna de estas tablas tiene grupo_id directo):
--   matches            → convocatoria_id → can_manage_convocatoria (ya existe)
--   match_teams        → match_id        → can_manage_match
--   match_team_players → match_team_id   → can_manage_match_team
--   match_player_stats → match_id        → can_manage_match
--
-- ⚠️ Los helpers son SECURITY DEFINER: resuelven el grupo de la tabla padre
-- saltando RLS, evitando cualquier recursión de policies (mismo motivo que
-- can_manage_convocatoria en FUT-107a).
--
-- Las funciones SECURITY DEFINER del partido (confirmar/goles/figura/premios)
-- gatean admin DENTRO de la función y se rescopean en su propio PR. La capa app
-- (requireRole) se rescopea en 2c. Esto es solo la RLS de las 4 tablas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helpers: resolver el grupo de un match / match_team SALTANDO RLS
-- ----------------------------------------------------------------------------
create or replace function public.can_manage_match(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_convocatoria(
    (select convocatoria_id from public.matches where id = p_match_id)
  );
$$;

comment on function public.can_manage_match(uuid) is
  'FUT-107b: true si el usuario puede gestionar el partido (= su grupo, via convocatoria). SECURITY DEFINER para evitar recursión de policies.';

revoke all on function public.can_manage_match(uuid) from public;
grant execute on function public.can_manage_match(uuid) to authenticated;

create or replace function public.can_manage_match_team(p_match_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_match(
    (select match_id from public.match_teams where id = p_match_team_id)
  );
$$;

comment on function public.can_manage_match_team(uuid) is
  'FUT-107b: true si el usuario puede gestionar el equipo de un partido (= su grupo). SECURITY DEFINER para evitar recursión de policies.';

revoke all on function public.can_manage_match_team(uuid) from public;
grant execute on function public.can_manage_match_team(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. matches  (grupo via convocatoria)
-- ----------------------------------------------------------------------------
drop policy if exists matches_select_admin_veedor on public.matches;
create policy matches_select_admin_veedor
  on public.matches
  for select
  to authenticated
  using (
    public.current_user_role() in ('admin', 'veedor')
    or public.can_manage_convocatoria(convocatoria_id)
  );

drop policy if exists matches_insert_admin on public.matches;
create policy matches_insert_grupo
  on public.matches
  for insert
  to authenticated
  with check (public.can_manage_convocatoria(convocatoria_id));

drop policy if exists matches_update_admin on public.matches;
create policy matches_update_grupo
  on public.matches
  for update
  to authenticated
  using (public.can_manage_convocatoria(convocatoria_id))
  with check (public.can_manage_convocatoria(convocatoria_id));

-- ----------------------------------------------------------------------------
-- 3. match_teams  (grupo via match)
-- ----------------------------------------------------------------------------
drop policy if exists match_teams_select_admin_veedor on public.match_teams;
create policy match_teams_select_admin_veedor
  on public.match_teams
  for select
  to authenticated
  using (
    public.current_user_role() in ('admin', 'veedor')
    or public.can_manage_match(match_id)
  );

drop policy if exists match_teams_insert_admin on public.match_teams;
create policy match_teams_insert_grupo
  on public.match_teams
  for insert
  to authenticated
  with check (public.can_manage_match(match_id));

drop policy if exists match_teams_update_admin on public.match_teams;
create policy match_teams_update_grupo
  on public.match_teams
  for update
  to authenticated
  using (public.can_manage_match(match_id))
  with check (public.can_manage_match(match_id));

-- ----------------------------------------------------------------------------
-- 4. match_team_players  (grupo via match_team)
-- ----------------------------------------------------------------------------
drop policy if exists match_team_players_select_admin_veedor on public.match_team_players;
create policy match_team_players_select_admin_veedor
  on public.match_team_players
  for select
  to authenticated
  using (
    public.current_user_role() in ('admin', 'veedor')
    or public.can_manage_match_team(match_team_id)
  );

drop policy if exists match_team_players_insert_admin on public.match_team_players;
create policy match_team_players_insert_grupo
  on public.match_team_players
  for insert
  to authenticated
  with check (public.can_manage_match_team(match_team_id));

drop policy if exists match_team_players_update_admin on public.match_team_players;
create policy match_team_players_update_grupo
  on public.match_team_players
  for update
  to authenticated
  using (public.can_manage_match_team(match_team_id))
  with check (public.can_manage_match_team(match_team_id));

-- ----------------------------------------------------------------------------
-- 5. match_player_stats  (grupo via match)
-- ----------------------------------------------------------------------------
drop policy if exists match_player_stats_select_admin_veedor on public.match_player_stats;
create policy match_player_stats_select_admin_veedor
  on public.match_player_stats
  for select
  to authenticated
  using (
    public.current_user_role() in ('admin', 'veedor')
    or public.can_manage_match(match_id)
  );

drop policy if exists match_player_stats_insert_admin on public.match_player_stats;
create policy match_player_stats_insert_grupo
  on public.match_player_stats
  for insert
  to authenticated
  with check (public.can_manage_match(match_id));

drop policy if exists match_player_stats_update_admin on public.match_player_stats;
create policy match_player_stats_update_grupo
  on public.match_player_stats
  for update
  to authenticated
  using (public.can_manage_match(match_id))
  with check (public.can_manage_match(match_id));

-- ----------------------------------------------------------------------------
-- DELETE: sin policies (RLS bloquea) en las 4 tablas. La historia no se borra.
-- ----------------------------------------------------------------------------
