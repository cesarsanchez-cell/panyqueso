-- ============================================================================
-- Pierna hábil: agregar el valor 'ninguna'
-- ============================================================================
--
-- A pedido de varios jugadores que se dan de alta: además de derecha/izquierda/
-- ambas (y el "Prefiero no decir" que guarda null), se suma "Ninguna" como
-- valor explícito y distinto. No se usa en el scoring; es dato neutro de perfil.
--
-- ADD VALUE no se USA en esta misma transacción (solo se agrega), así corre sin
-- el error "unsafe use of new value".
-- ============================================================================

alter type public.pierna_habil_enum add value if not exists 'ninguna';
