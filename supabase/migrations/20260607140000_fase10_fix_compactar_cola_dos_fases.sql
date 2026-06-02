-- ============================================================================
-- Fase 10 fix: _conv_compactar_cola debe renumerar en DOS FASES
-- ============================================================================
--
-- Bug reportado: el admin quita a un SUPLENTE de la convocatoria y salta
--   "duplicate key value violates unique constraint
--    convocatoria_players_suplente_orden_uq".
--
-- Causa: _conv_compactar_cola corria la cola con un solo UPDATE
--   set orden_suplente = orden_suplente - 1 where orden_suplente > p_from_orden
-- El indice unico parcial convocatoria_players_suplente_orden_uq
-- (convocatoria_id, orden_suplente where suplente y no-declinado) se chequea
-- fila por fila durante el UPDATE. El orden de procesamiento de filas NO esta
-- garantizado: si Postgres toca primero la fila orden 3 (3 -> 2) cuando todavia
-- existe la fila orden 2, hay un choque TRANSITORIO aunque el estado final sea
-- unico. Es la misma clase de bug que se arreglo en set_convocatoria_cupo
-- (migracion 20260607120000), pero en la ruta de compactacion de la cola, que
-- usan admin_remove_from_convocatoria, player_decline_convocatoria y el trigger
-- de la bolsa v3.
--
-- Fix: recompactar TODA la cola de suplentes activos a 1..N en dos fases que
-- nunca colisionan con el indice:
--   Fase 1: empujar los ordenes a un rango temporal alto (offset disjunto del
--           rango real y de si mismo -> sin choque transitorio).
--   Fase 2: reasignar contiguos 1..N por row_number sobre el orden temporal
--           (rango destino 1..N disjunto del temporal -> sin choque).
--
-- El parametro p_from_orden se conserva por compatibilidad de firma (todos los
-- callers la invocan), pero ya no se usa: recompactar toda la cola da el mismo
-- resultado que correr solo la cola desde la vacante y es robusto ante cualquier
-- estado inicial.
-- ============================================================================

create or replace function public._conv_compactar_cola(
  p_convocatoria_id uuid,
  p_from_orden int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Fase 1: mover los ordenes activos a un rango temporal alto. El offset es
  -- mayor que cualquier cupo realista, asi que el rango temporal es disjunto del
  -- rango real y la suma es inyectiva -> ningun choque transitorio.
  update public.convocatoria_players
     set orden_suplente = orden_suplente + 1000000,
         updated_at = now()
   where convocatoria_id = p_convocatoria_id
     and rol_en_convocatoria = 'suplente'
     and attendance_status <> 'declinado'
     and orden_suplente is not null;

  -- Fase 2: reasignar contiguos 1..N respetando el orden previo. El rango
  -- destino (1..N) es disjunto del temporal (1000001+), asi que tampoco choca.
  with ordered as (
    select id, row_number() over (order by orden_suplente) as rn
      from public.convocatoria_players
     where convocatoria_id = p_convocatoria_id
       and rol_en_convocatoria = 'suplente'
       and attendance_status <> 'declinado'
       and orden_suplente is not null
  )
  update public.convocatoria_players cp
     set orden_suplente = ordered.rn,
         updated_at = now()
    from ordered
   where cp.id = ordered.id;
end;
$$;

comment on function public._conv_compactar_cola(uuid, int) is
  'Fase 10 v2 helper: recompacta la cola de suplentes activos (no declinados) de una convocatoria a 1..N en dos fases (offset temporal + reasignacion) para no chocar con el indice unico parcial. p_from_orden se ignora (se conserva por compatibilidad de firma).';

revoke all on function public._conv_compactar_cola(uuid, int) from public;
