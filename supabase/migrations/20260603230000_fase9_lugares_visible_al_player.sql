-- ============================================================================
-- Fase 9 follow-up: lugares legible para el rol 'player'
-- ============================================================================
--
-- Hasta hoy la policy lugares_select_admin_veedor solo dejaba leer a admin
-- y veedor. El player consulta lugares indirectamente cuando /mi-perfil
-- hace el join convocatorias.lugar_id -> lugares para mostrar nombre + URL
-- de Maps. Sin policy de SELECT, el join devuelve NULL y la UI dice
-- "Sin lugar".
--
-- Los lugares no son sensibles (son canchas publicas con su ubicacion en
-- Maps). Habilitamos SELECT a todo authenticated.
-- ============================================================================

create policy lugares_select_authenticated
  on public.lugares
  for select
  to authenticated
  using (true);

comment on policy lugares_select_authenticated on public.lugares is
  'Fase 9 follow-up: cualquier usuario autenticado lee el catalogo de lugares. Necesario para que el rol player vea el lugar y URL de Maps de sus convocatorias.';
