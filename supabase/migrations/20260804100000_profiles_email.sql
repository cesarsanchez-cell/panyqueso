-- ============================================================================
-- Email de contacto a nivel cuenta (profiles)
-- ============================================================================
--
-- Fase 4 del coordinador/veedor sin ficha. Un coordinador/veedor puro (sin
-- ficha de jugador) solo tenía nombre + celular (el login). Agregamos un email
-- OPCIONAL de contacto a nivel cuenta, para tener una vía alternativa y, más
-- adelante, habilitar la recuperación de contraseña por email (no se engancha
-- todavía).
--
-- Va en profiles (no en players): es dato de la CUENTA, sirve para cualquier rol
-- sin ficha (coordinador/veedor/admin). Los que además son jugadores ya tienen
-- su email en players. Es solo de contacto: NO es el email de login (ese sigue
-- siendo el sintético <celular>@phone.fdlm.local en auth.users).
-- ============================================================================

alter table public.profiles add column if not exists email text;

comment on column public.profiles.email is
  'Fase 4: email de contacto OPCIONAL a nivel cuenta (no es el email de login). Para coordinador/veedor sin ficha; los jugadores tienen su email en players.';
