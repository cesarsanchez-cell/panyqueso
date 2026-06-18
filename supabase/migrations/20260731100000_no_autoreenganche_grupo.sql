-- ============================================================================
-- Bajarse del grupo: solo el coord/admin vuelve a sumar (no auto-reenganche)
-- ============================================================================
--
-- Modelo: declinar una convocatoria NO te saca del grupo (player_decline_
-- convocatoria no toca grupo_membresias). Bajarse del GRUPO sí: la membresía
-- queda 'inactivo'. Y para volver a entrar, lo decide el coord/admin (que ya
-- tiene su flujo de sumar miembros), no el jugador por su cuenta.
--
-- player_join_suplente_queue era el auto-reenganche del jugador ("Volver al
-- grupo" en /mi-perfil). Se deshabilita: revocamos el execute a authenticated.
-- La UI ya no lo ofrece; esto cierra la puerta también a nivel API.
-- ============================================================================

revoke execute on function public.player_join_suplente_queue(uuid) from authenticated, public;

comment on function public.player_join_suplente_queue(uuid) is
  'DESHABILITADA (FUT): el jugador no se reincorpora solo al grupo. Si se bajó o lo sacaron, lo vuelve a sumar el coord/admin. Sin execute para authenticated.';
