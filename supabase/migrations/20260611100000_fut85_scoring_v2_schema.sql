-- ============================================================================
-- FUT-85: Modelo de puntuación v2 — capa de datos (Fase 1, aditiva)
-- ============================================================================
--
-- Enriquece el rating interno: cada dimensión (físico/mental/técnica) pasa a
-- tener 3 subcomponentes (9 sub-ratings 1–10). La edad se vuelve un
-- multiplicador del físico con escalones (no un sumando suelto).
--
-- Análisis funcional: Notion §11. Spec decidida:
--   - Físico:  power, speed, stamina
--   - Mental:  tactical, resilience, attitude
--   - Técnica: passing, finishing, linkup
--   - Dimensión = promedio simple de sus 3 subs.
--   - factor_edad: ≤35 1.00 · 36–45 0.90 · 46–55 0.80 · 56–65 0.70 · 66+ 0.60
--   - físico_efectivo = físico × factor_edad
--   - score = físico_efectivo × 0.35 + mental × 0.325 + técnica × 0.325
--
-- ESTA FASE ES ADITIVA Y NO CAMBIA EL COMPORTAMIENTO EN PROD:
--   - Agrega las 9 columnas y las seedea desde technical/physical/mental.
--   - Agrega age_physical_factor + compute_internal_score_v2 como funciones
--     NUEVAS, pero NO las enchufa al trigger todavía. El score interno se
--     sigue calculando con la fórmula vieja hasta la Fase 2 (UI que carga los
--     subs + flip del source-of-truth). Así nada se rompe en prod.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Columnas de subcomponentes (nullable; el check se agrega tras el seed)
-- ---------------------------------------------------------------------------
alter table public.players
  add column if not exists phys_power      int,
  add column if not exists phys_speed      int,
  add column if not exists phys_stamina    int,
  add column if not exists ment_tactical   int,
  add column if not exists ment_resilience int,
  add column if not exists ment_attitude   int,
  add column if not exists tech_passing    int,
  add column if not exists tech_finishing  int,
  add column if not exists tech_linkup     int;

comment on column public.players.phys_power is 'FUT-85: subcomponente Físico — potencia/fuerza (1–10).';
comment on column public.players.phys_speed is 'FUT-85: subcomponente Físico — velocidad (1–10).';
comment on column public.players.phys_stamina is 'FUT-85: subcomponente Físico — resistencia (1–10).';
comment on column public.players.ment_tactical is 'FUT-85: subcomponente Mental — orden táctico (1–10).';
comment on column public.players.ment_resilience is 'FUT-85: subcomponente Mental — resiliencia (1–10).';
comment on column public.players.ment_attitude is 'FUT-85: subcomponente Mental — actitud (1–10).';
comment on column public.players.tech_passing is 'FUT-85: subcomponente Técnica — pase (1–10).';
comment on column public.players.tech_finishing is 'FUT-85: subcomponente Técnica — eficacia/definición (1–10).';
comment on column public.players.tech_linkup is 'FUT-85: subcomponente Técnica — asociación / juego asociativo (1–10).';

-- ---------------------------------------------------------------------------
-- 2. Seed: cada sub arranca con el valor de su dimensión actual
-- ---------------------------------------------------------------------------
-- Pasa por players_enforce_immutability; estas columnas todavía no están en
-- la lista de sensibles, así que el UPDATE se permite. La Fase 2 las agrega
-- al gate cuando se vuelven la fuente de verdad.
update public.players
   set phys_power      = physical,
       phys_speed      = physical,
       phys_stamina    = physical,
       ment_tactical   = mental,
       ment_resilience = mental,
       ment_attitude   = mental,
       tech_passing    = technical,
       tech_finishing  = technical,
       tech_linkup     = technical
 where technical is not null
   and physical is not null
   and mental is not null;

-- ---------------------------------------------------------------------------
-- 3. Checks 1–10 (permiten NULL: filas nuevas pre-Fase 2 podrían no tenerlos)
-- ---------------------------------------------------------------------------
alter table public.players
  add constraint players_subratings_range_chk check (
    (phys_power      is null or phys_power      between 1 and 10) and
    (phys_speed      is null or phys_speed      between 1 and 10) and
    (phys_stamina    is null or phys_stamina    between 1 and 10) and
    (ment_tactical   is null or ment_tactical   between 1 and 10) and
    (ment_resilience is null or ment_resilience between 1 and 10) and
    (ment_attitude   is null or ment_attitude   between 1 and 10) and
    (tech_passing    is null or tech_passing    between 1 and 10) and
    (tech_finishing  is null or tech_finishing  between 1 and 10) and
    (tech_linkup     is null or tech_linkup     between 1 and 10)
  );

-- ---------------------------------------------------------------------------
-- 4. age_physical_factor: multiplicador de edad sobre el físico (escalones)
-- ---------------------------------------------------------------------------
create or replace function public.age_physical_factor(p_edad int)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_edad is null then 1.00::numeric
    when p_edad <= 35   then 1.00::numeric
    when p_edad <= 45   then 0.90::numeric
    when p_edad <= 55   then 0.80::numeric
    when p_edad <= 65   then 0.70::numeric
    else                     0.60::numeric
  end
$$;

comment on function public.age_physical_factor(int) is
  'FUT-85: factor de edad sobre el físico (estado actual). ≤35 1.00 · 36–45 0.90 · 46–55 0.80 · 56–65 0.70 · 66+ 0.60.';

revoke all on function public.age_physical_factor(int) from public;
grant execute on function public.age_physical_factor(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. compute_internal_score_v2: nueva fórmula desde las dimensiones (numeric)
-- ---------------------------------------------------------------------------
-- Recibe los promedios de dimensión (numeric, ya calculados desde los 9 subs)
-- + edad. El caller/trigger calcula los promedios. Latente hasta Fase 2.
create or replace function public.compute_internal_score_v2(
  p_physical  numeric,
  p_mental    numeric,
  p_technical numeric,
  p_edad      int
)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select round(
      (p_physical  * public.age_physical_factor(p_edad) * 0.350)
    + (p_mental    * 0.325)
    + (p_technical * 0.325),
    2
  )
$$;

comment on function public.compute_internal_score_v2(numeric, numeric, numeric, int) is
  'FUT-85: score interno v2. físico_efectivo×0.35 + mental×0.325 + técnica×0.325, con físico_efectivo = físico × age_physical_factor(edad). Recibe promedios de dimensión. Latente hasta Fase 2 (no enchufada al trigger todavía).';

revoke all on function public.compute_internal_score_v2(numeric, numeric, numeric, int) from public;
grant execute on function public.compute_internal_score_v2(numeric, numeric, numeric, int) to authenticated;
