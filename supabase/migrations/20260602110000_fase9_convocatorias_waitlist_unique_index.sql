-- ============================================================================
-- Fase 9: unique index parcial de waitlist (PR-A continuacion)
-- ============================================================================
--
-- Va en migracion separada porque PostgreSQL no permite usar un valor de enum
-- recien agregado (lista_espera) dentro de la misma transaccion en que se
-- creo. La migracion anterior 20260602100000 agrego ese valor; aca creamos
-- el indice que lo usa.
--
-- Garantiza que dentro de una convocatoria, el orden de waitlist es unico
-- entre los players que estan en lista_espera. Forward-compatible con
-- Modelo 1, no se usa en modo cerrada.
-- ============================================================================

create unique index if not exists convocatoria_players_waitlist_unique
  on public.convocatoria_players (convocatoria_id, waitlist_order)
  where attendance_status = 'lista_espera' and waitlist_order is not null;
