-- ============================================================================
-- FUT-107a (Fase 11, Bloque 2, 2b — dominio Convocatorias): rescopear RLS
-- ============================================================================
--
-- Reemplaza el "es admin" por can_manage_grupo(grupo) en las policies de
-- escritura de convocatorias y convocatoria_players, y agrega al coordinador en
-- las de lectura. Así el coordinador opera las convocatorias de SU grupo (crear,
-- editar el draft, manejar el roster), y NO las de otros grupos.
--
--   - Escritura (insert/update/delete): can_manage_grupo(grupo) = admin (todos)
--     o coordinador del grupo. El veedor NO escribe.
--   - Lectura: admin + veedor (todo) o coordinador de ese grupo.
--   - Convocatoria suelta (grupo_id null): can_manage_grupo(null) => solo admin.
--
-- convocatoria_players no tiene grupo_id: se resuelve por su convocatoria.
-- La capa app (requireRole) se rescopea en 2c; esto es solo la DB.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. convocatorias
-- ----------------------------------------------------------------------------
drop policy if exists convocatorias_select_admin_veedor on public.convocatorias;
create policy convocatorias_select_admin_veedor
  on public.convocatorias
  for select
  to authenticated
  using (
    public.current_user_role() in ('admin', 'veedor')
    or public.can_manage_grupo(grupo_id)
  );

drop policy if exists convocatorias_insert_admin on public.convocatorias;
create policy convocatorias_insert_grupo
  on public.convocatorias
  for insert
  to authenticated
  with check (public.can_manage_grupo(grupo_id));

drop policy if exists convocatorias_update_admin on public.convocatorias;
create policy convocatorias_update_grupo
  on public.convocatorias
  for update
  to authenticated
  using (public.can_manage_grupo(grupo_id))
  with check (public.can_manage_grupo(grupo_id));

-- ----------------------------------------------------------------------------
-- 2. convocatoria_players (grupo via la convocatoria padre)
-- ----------------------------------------------------------------------------
drop policy if exists convocatoria_players_select_admin_veedor on public.convocatoria_players;
create policy convocatoria_players_select_admin_veedor
  on public.convocatoria_players
  for select
  to authenticated
  using (
    public.current_user_role() in ('admin', 'veedor')
    or public.can_manage_grupo(
      (select c.grupo_id from public.convocatorias c where c.id = convocatoria_id)
    )
  );

drop policy if exists convocatoria_players_insert_admin on public.convocatoria_players;
create policy convocatoria_players_insert_grupo
  on public.convocatoria_players
  for insert
  to authenticated
  with check (
    public.can_manage_grupo(
      (select c.grupo_id from public.convocatorias c where c.id = convocatoria_id)
    )
  );

drop policy if exists convocatoria_players_update_admin on public.convocatoria_players;
create policy convocatoria_players_update_grupo
  on public.convocatoria_players
  for update
  to authenticated
  using (
    public.can_manage_grupo(
      (select c.grupo_id from public.convocatorias c where c.id = convocatoria_id)
    )
  )
  with check (
    public.can_manage_grupo(
      (select c.grupo_id from public.convocatorias c where c.id = convocatoria_id)
    )
  );

drop policy if exists convocatoria_players_delete_admin on public.convocatoria_players;
create policy convocatoria_players_delete_grupo
  on public.convocatoria_players
  for delete
  to authenticated
  using (
    public.can_manage_grupo(
      (select c.grupo_id from public.convocatorias c where c.id = convocatoria_id)
    )
  );
