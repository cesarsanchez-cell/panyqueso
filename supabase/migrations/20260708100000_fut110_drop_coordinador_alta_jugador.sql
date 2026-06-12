-- ============================================================================
-- FUT-110 (cleanup): drop del RPC huérfano coordinador_alta_jugador
-- ============================================================================
--
-- El alta de jugador pasó a ser el flujo de dos pasos (lookup_jugador_por_celular
-- + vincular_jugador_a_grupo para los que existen; invitación para los nuevos —
-- FUT-110). El viejo coordinador_alta_jugador (crear-o-vincular en un solo paso,
-- con edad y rama de creación 1/1/1) ya no lo llama nadie en la app. Lo borramos.
--
-- Su test (coordinador_alta_jugador.sql) se elimina en el mismo cambio. La
-- cobertura del vínculo + herencia de rating vive ahora en lookup_vincular_jugador.
-- ============================================================================

drop function if exists public.coordinador_alta_jugador(uuid, text, text, int);
