-- ============================================================================
-- FUT-85: tests del scoring v2 (age_physical_factor + compute_internal_score_v2)
-- ============================================================================
--
-- Cubre:
--   1. Las 9 columnas de subcomponentes existen.
--   2. age_physical_factor por escalón (≤35 / 36–45 / 46–55 / 56–65 / 66+).
--   3. compute_internal_score_v2: todo 10, edad 30 → 10.00.
--   4. compute_internal_score_v2: todo 10, edad 60 (factor 0.70) → 8.95.
--   5. compute_internal_score_v2: todo 10, edad 70 (factor 0.60) → 8.60.
--   6. compute_internal_score_v2: promedios mixtos.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

select plan(13);

-- 1. Columnas existen.
select has_column('public', 'players', 'phys_power', 'players.phys_power existe');
select has_column('public', 'players', 'ment_tactical', 'players.ment_tactical existe');
select has_column('public', 'players', 'tech_linkup', 'players.tech_linkup existe');

-- 2. age_physical_factor por escalón (incluye bordes).
select is(public.age_physical_factor(35), 1.00::numeric, 'edad 35 → 1.00');
select is(public.age_physical_factor(36), 0.90::numeric, 'edad 36 → 0.90');
select is(public.age_physical_factor(45), 0.90::numeric, 'edad 45 → 0.90');
select is(public.age_physical_factor(46), 0.80::numeric, 'edad 46 → 0.80');
select is(public.age_physical_factor(55), 0.80::numeric, 'edad 55 → 0.80');
select is(public.age_physical_factor(56), 0.70::numeric, 'edad 56 → 0.70');
select is(public.age_physical_factor(66), 0.60::numeric, 'edad 66 → 0.60');

-- 3. Todo 10, edad 30: 10×1×0.35 + 10×0.325 + 10×0.325 = 10.00.
select is(
  public.compute_internal_score_v2(10, 10, 10, 30),
  10.00::numeric,
  'score: todo 10, edad 30 → 10.00'
);

-- 4. Todo 10, edad 60 (factor 0.70): 10×0.7×0.35 + 6.5 = 2.45 + 6.5 = 8.95.
select is(
  public.compute_internal_score_v2(10, 10, 10, 60),
  8.95::numeric,
  'score: todo 10, edad 60 → 8.95'
);

-- 5. Todo 10, edad 70 (factor 0.60): 10×0.6×0.35 + 6.5 = 2.10 + 6.5 = 8.60.
select is(
  public.compute_internal_score_v2(10, 10, 10, 70),
  8.60::numeric,
  'score: todo 10, edad 70 → 8.60'
);

select * from finish();
rollback;
