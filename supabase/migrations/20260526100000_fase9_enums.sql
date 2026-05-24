-- ============================================================================
-- Fase 9 PR 1: enums nuevos / extendidos
-- ============================================================================
--
-- Para soportar el onboarding del jugador + grupos recurrentes:
--   - pierna_habil_enum: nuevo, opcional en el perfil del jugador.
--   - user_role: + 'player' (antes solo admin/veedor).
--   - player_change_request.action_type: + 'assign_initial_ratings'
--     (el admin asigna ratings iniciales tras el signup del jugador).
--
-- Las migraciones que crean tablas/columnas usando estos enums viven en
-- archivos posteriores, separadas para que los ADD VALUE queden commiteados.
-- ============================================================================

-- Enum pierna_habil_enum: derecha / izquierda / ambas. Opcional en players.
create type public.pierna_habil_enum as enum ('derecha', 'izquierda', 'ambas');

comment on type public.pierna_habil_enum is
  'Fase 9: pierna habil del jugador. Opcional, util tactico, no invasivo.';

-- Rol nuevo: 'player'. Jugador con cuenta propia, self-service en /mi-perfil.
alter type public.user_role add value if not exists 'player';

-- Action type nuevo: el admin asigna ratings al jugador recien registrado.
-- El veedor aprueba via approve_player_change_request.
alter type public.change_request_action add value if not exists 'assign_initial_ratings';
