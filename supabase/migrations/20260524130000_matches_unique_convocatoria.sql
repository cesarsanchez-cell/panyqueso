-- ============================================================================
-- Fase 6 self-audit hotfix: unique(convocatoria_id) en matches
-- ============================================================================
--
-- Bug detectado en self-audit de Fase 6:
--   confirmMatch (server action TS) hace lectura -> validacion ->
--   inserts encadenados. Si dos admins click "Confirmar match" sobre la
--   misma convocatoria simultaneamente, ambos pasan el check
--   status='abierta' antes que el UPDATE pegue, ambos insertan matches.
--   Resultado: 2 matches por una convocatoria, dos balance_snapshots.
--
-- Fix forward-only: unique constraint en matches.convocatoria_id. El
-- segundo INSERT falla con 23505 (unique violation) y el server action
-- lo mapea a "ya existe un partido para esta convocatoria".
--
-- En prod no deberia haber matches duplicados (es una convocatoria
-- nueva, fresh column). Si hubiera, esta migracion fallaria al crear
-- el constraint — habria que limpiar manualmente. Para el caso normal
-- (sin duplicados), la migracion es no-op funcional.
-- ============================================================================

alter table public.matches
  add constraint matches_convocatoria_id_unique unique (convocatoria_id);

comment on constraint matches_convocatoria_id_unique on public.matches is
  'Fase 6 hotfix: una convocatoria puede tener como mucho un match confirmado. Previene race condition en confirmMatch.';
