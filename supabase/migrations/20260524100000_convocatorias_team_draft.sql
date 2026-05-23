-- ============================================================================
-- Fase 6 PR 2: columna team_draft en convocatorias
-- ============================================================================
--
-- El generador de teams (PR 1) era determinístico y recomputaba en cada
-- render. Para permitir ajustes manuales (mover jugadores, cambiar GK)
-- necesitamos persistir el "draft" entre requests.
--
-- Estructura del JSON:
--   {
--     "A": { "goalkeeperPlayerId": uuid | null, "playerIds": [uuid, ...] },
--     "B": { "goalkeeperPlayerId": uuid | null, "playerIds": [uuid, ...] }
--   }
--
-- - NULL: no hay draft generado todavia. La UI muestra "Generar teams".
-- - Objeto: draft persistido. La UI lo renderiza y permite swaps.
--
-- Validacion estructural:
--   - El servidor valida que los player_ids estén en convocatoria_players
--     antes de escribir. No agregamos check constraint para evitar joins
--     dentro del check (Postgres no permite subselects en checks); el
--     server action (Fase 6 PR 2) hace la validacion.
--   - Cuando se cancela la convocatoria, el draft queda como historico.
--     PR 3 (confirmar match) usara el draft para crear match_teams y
--     limpiara el campo si la convocatoria pasa a 'jugada'.
--
-- No agregamos policies nuevas: las UPDATE de Fase 2 (convocatorias_update_admin)
-- ya cubren la mutacion del campo.
-- ============================================================================

alter table public.convocatorias
  add column team_draft jsonb;

comment on column public.convocatorias.team_draft is
  'Fase 6 PR 2: snapshot del draft de teams (admin puede ajustar manualmente). NULL = sin generar todavia.';
