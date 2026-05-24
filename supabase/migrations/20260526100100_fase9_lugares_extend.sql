-- ============================================================================
-- Fase 9 PR 1: lugares + google_maps_url
-- ============================================================================
--
-- El invitado nuevo necesita saber dónde queda la cancha. Decisión: solo
-- guardar la URL de Google Maps que el admin pega manualmente al crear el
-- lugar. Sin API key, sin geocoding, sin mapas embebidos: un botón "Abrir
-- en Maps" basta.
--
-- La columna es opcional para no romper lugares existentes (los 3-4 del MVP).
-- El admin puede completarla cuando quiera desde /lugares.
-- ============================================================================

alter table public.lugares
  add column if not exists google_maps_url text;

comment on column public.lugares.google_maps_url is
  'Fase 9: link a Google Maps del lugar (pegado manualmente por el admin). Visible al invitado en /invite/<token>.';
