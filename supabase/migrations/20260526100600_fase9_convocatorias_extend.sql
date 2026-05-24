-- ============================================================================
-- Fase 9 PR 1: convocatorias + default attendance + grupo_id
-- ============================================================================
--
-- 1. convocatorias.grupo_id: FK al grupo recurrente. Nullable para mantener
--    compat con las convocatorias del MVP (que no tienen grupo). Nuevas
--    convocatorias creadas dentro de un grupo pueden setearlo.
--
-- 2. convocatoria_players.attendance_status default cambia de 'pendiente'
--    a 'confirmado'. Refleja la regla del producto: cuando un jugador esta
--    convocado, se lo asume confirmado por default. Si no puede ir, tiene q
--    bajarse activamente (declinado) antes de las 8h del partido.
--
-- Convocatorias del MVP no se ven afectadas (sus filas en
-- convocatoria_players ya tienen valores explicitos de attendance_status).
-- El cambio de default solo aplica a INSERTs nuevos sin valor.
-- ============================================================================

-- 1. grupo_id en convocatorias -----------------------------------------------
alter table public.convocatorias
  add column if not exists grupo_id uuid references public.grupos(id) on delete set null;

comment on column public.convocatorias.grupo_id is
  'Fase 9: FK al grupo recurrente que generó esta convocatoria. Nullable para compat con convocatorias del MVP (sin grupo).';

create index if not exists convocatorias_grupo_idx
  on public.convocatorias (grupo_id);

-- 2. Default 'confirmado' en convocatoria_players ----------------------------
alter table public.convocatoria_players
  alter column attendance_status set default 'confirmado';

comment on column public.convocatoria_players.attendance_status is
  'Fase 9: default cambio a confirmado. La convocacion implica confirmacion; el jugador se baja activamente (declinado) antes de 8h del partido si no puede.';
