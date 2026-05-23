-- ============================================================================
-- Fase 5 PR 3 hotfix: DELETE policy admin-only en convocatoria_players
-- ============================================================================
--
-- Bug del auditor de Fase 5:
--   El server action removePlayer hace DELETE sobre convocatoria_players,
--   pero la RLS de Fase 2 (FUT-29, 20260522183914) solo definio policies
--   SELECT/INSERT/UPDATE para esa tabla — DELETE quedo sin policy y por lo
--   tanto bloqueado para todos los clientes.
--
--   Resultado: el boton "Quitar" del detalle de convocatoria fallaba en
--   runtime aunque la UI lo mostraba.
--
-- Decision:
--   Agregar DELETE policy admin-only sobre convocatoria_players. Es
--   semanticamente correcto: quitar un convocado de una convocatoria no
--   destruye historial (la convocatoria sigue ahi con sus otros
--   convocados, y la cancelacion sigue cubierta por status='cancelada').
--
--   El check status='abierta' se queda en el server action removePlayer:
--   - Aplicar via trigger DB seria mas defensivo pero el auditor explicito
--     "policy DELETE admin-only ... o funcion SECURITY DEFINER" como
--     opciones aceptables. La policy es la mas simple.
--
--   El resto de las tablas relacionadas (convocatorias, matches,
--   match_teams, match_team_players, match_player_stats) siguen con DELETE
--   bloqueado — para esas, la "cancelacion" / "borrado" sigue siendo
--   transicion de estado, no DELETE fisico.
-- ============================================================================

create policy convocatoria_players_delete_admin
  on public.convocatoria_players
  for delete
  to authenticated
  using (public.current_user_role() = 'admin');

comment on policy convocatoria_players_delete_admin on public.convocatoria_players is
  'Fase 5 hotfix: admin puede quitar convocados. status check se hace en server action removePlayer.';
