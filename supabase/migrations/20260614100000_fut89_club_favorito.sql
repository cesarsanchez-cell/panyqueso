-- ============================================================================
-- FUT-89 (Fase 1 · DB): club favorito del jugador
-- ============================================================================
--
-- Agrega players.club_id: el club del que el jugador es hincha. Dato neutro/
-- positivo (se puede mostrar al jugador). Es un slug que referencia un catálogo
-- ESTÁTICO en código (lib/clubs.ts) — no hay tabla clubs ni FK. Opcional
-- (NULL = "Ninguno").
--
-- No es sensible: no pasa por el veedor. Lo puede setear el admin (column-level
-- GRANT + policy players_update_admin_notes) y, vía RPC de self-service, el
-- propio jugador desde /mi-perfil (eso se conecta en la Fase 2 de la UI).
-- ============================================================================

alter table public.players
  add column if not exists club_id text;

comment on column public.players.club_id is
  'FUT-89: slug del club favorito (catálogo estático lib/clubs.ts). NULL = ninguno. Dato neutro, no sensible.';

-- GRANT a authenticated para que el admin lo edite directo (igual que el resto
-- de los campos admin-direct). El gate de rol lo da la policy existente
-- players_update_admin_notes (admin-only).
grant update (club_id) on public.players to authenticated;
