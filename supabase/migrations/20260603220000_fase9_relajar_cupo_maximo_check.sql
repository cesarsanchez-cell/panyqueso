-- ============================================================================
-- Fase 9 follow-up: relajar el rango de cupo_maximo a 6..24
-- ============================================================================
--
-- El check original (10..24) viene del MVP donde la convocatoria definia su
-- propio cupo. Hoy el cupo lo manda el grupo (cupo_titulares), que permite
-- 6..24. Para que la convocatoria pueda heredarlo sin chocar, alineamos el
-- rango del check.
-- ============================================================================

alter table public.convocatorias
  drop constraint convocatorias_cupo_maximo_check;

alter table public.convocatorias
  add constraint convocatorias_cupo_maximo_check
  check (cupo_maximo between 6 and 24);
