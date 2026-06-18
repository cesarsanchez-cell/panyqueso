-- ============================================================================
-- Confianza (Fase 3): nuevo estado 'inicial' = todavía no fue evaluado
-- ============================================================================
--
-- Hoy un jugador recién dado de alta queda en 'baja', que se confunde con
-- "evaluado con confianza baja". Se agrega 'inicial' para distinguir "nadie lo
-- calificó aún". El default, el trigger de alta y el backfill van en la
-- migración siguiente (un valor agregado con ALTER TYPE ... ADD VALUE no se
-- puede USAR en la misma transacción en que se agrega).
-- ============================================================================

alter type public.rating_confidence add value if not exists 'inicial';
