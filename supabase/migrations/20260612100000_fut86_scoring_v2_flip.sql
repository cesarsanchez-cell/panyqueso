-- ============================================================================
-- FUT-86 (Fase 2a): enchufar la fórmula v2 al cálculo del score interno
-- ============================================================================
--
-- Hasta acá (FUT-85) las funciones v2 quedaron latentes. Esta migración hace
-- el SWITCH: el trigger que calcula players.internal_score pasa de la fórmula
-- vieja (compute_internal_score: técnica×0.45 + físico×factor_curva×0.30 +
-- mental×0.25) a la v2 (compute_internal_score_v2: físico_efectivo×0.35 +
-- mental×0.325 + técnica×0.325, con físico_efectivo = físico × escalón_edad).
--
-- El generador de equipos solo usa internal_score, así que con este flip el
-- balance ya pasa a regirse por el modelo v2. La UI de 3 ratings actual sigue
-- funcionando y alimenta la nueva fórmula. La carga de los 9 sub-ratings llega
-- en la Fase 2b (FUT-86 UI): ahí técnica/físico/mental se guardan como el
-- promedio de sus subs.
--
-- ⚠️ EFECTO EN PROD: recalcula el internal_score de TODOS los jugadores (pesos
-- nuevos + escalones de edad). El balance de equipos cambia respecto de antes.
-- Es el objetivo del cambio.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Redefinir el trigger function para usar la fórmula v2
-- ---------------------------------------------------------------------------
-- Nota: compute_internal_score_v2 recibe (physical, mental, technical, edad)
-- — distinto orden que la vieja compute_internal_score(technical, physical, ...).
create or replace function public.players_set_internal_score()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.internal_score := public.compute_internal_score_v2(
    new.physical::numeric,
    new.mental::numeric,
    new.technical::numeric,
    new.edad
  );
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.players_set_internal_score() is
  'FUT-86 Fase 2a: setea internal_score con la fórmula v2 (compute_internal_score_v2) desde las dimensiones técnica/físico/mental + edad. El promedio de los 9 subs vive en técnica/físico/mental (lo escribe la UI de la Fase 2b).';

-- ---------------------------------------------------------------------------
-- 2. Backfill: recalcular el internal_score de todos los jugadores
-- ---------------------------------------------------------------------------
-- El trigger players_compute_score dispara con `update of ... edad`. Tocamos
-- edad con su mismo valor: el trigger de inmutabilidad corre primero (ve
-- internal_score sin cambiar todavía → OK), luego players_compute_score
-- recalcula con la v2. Corre como owner de la migración: sin RLS ni grants.
update public.players set edad = edad;
