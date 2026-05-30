-- ============================================================================
-- Fase 9 fix (Bug 5): no persistir convocatorias canceladas
-- ============================================================================
--
-- Una convocatoria 'cancelada' no aporta nada al historial: el partido no se
-- jugo, no hay teams ni resultados. En vez de dejar el row con status
-- 'cancelada', el admin la elimina.
--
-- Cambios:
--   1. Politica RLS de DELETE en convocatorias para admin, restringida a
--      status='abierta'. cerrada/jugada NO se borran (tienen historia /
--      match asociado; ademas matches.convocatoria_id es ON DELETE RESTRICT).
--      convocatoria_players cascada (ON DELETE CASCADE) y player_invitations
--      se desvincula (ON DELETE SET NULL).
--   2. Limpieza one-time de las canceladas legacy que quedaron en prod. Una
--      conv cancelada nunca tiene match (para confirmar match la conv debe
--      estar 'abierta'), pero filtramos por NOT EXISTS por las dudas para no
--      chocar con el FK RESTRICT.
--
-- El enum convocatoria_status conserva el valor 'cancelada' por compatibilidad;
-- simplemente dejamos de producir filas con ese estado.
-- ============================================================================

-- 1. Politica RLS de DELETE (admin, solo abierta).
drop policy if exists convocatorias_delete_admin on public.convocatorias;
create policy convocatorias_delete_admin
  on public.convocatorias
  for delete
  to authenticated
  using (public.current_user_role() = 'admin' and status = 'abierta');

-- 2. Limpieza de canceladas legacy sin match.
delete from public.convocatorias c
 where c.status = 'cancelada'
   and not exists (
     select 1 from public.matches m where m.convocatoria_id = c.id
   );
