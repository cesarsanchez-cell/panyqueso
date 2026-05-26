-- ============================================================================
-- Fase 9 follow-up: relajar la coherencia rol/orden para filas declinadas
-- ============================================================================
--
-- Bug: el check constraint convocatoria_players_rol_orden_coherente exige
-- que (rol='suplente' => orden_suplente > 0). El RPC player_decline_convocatoria
-- limpia orden_suplente=NULL al marcar declinado pero deja rol='suplente'
-- (no podemos blanquear rol porque la columna es NOT NULL). El resultado
-- es que el UPDATE viola la constraint y el decline falla.
--
-- Arreglo: las filas declinadas estan fuera del roster activo, no
-- necesitan respetar coherencia rol/orden. La unique partial index ya las
-- excluye, asi que no hay riesgo de colision.
-- ============================================================================

alter table public.convocatoria_players
  drop constraint convocatoria_players_rol_orden_coherente;

alter table public.convocatoria_players
  add constraint convocatoria_players_rol_orden_coherente
  check (
    attendance_status = 'declinado'
    or (rol_en_convocatoria = 'titular' and orden_suplente is null)
    or (rol_en_convocatoria = 'suplente' and orden_suplente is not null and orden_suplente > 0)
  );

comment on constraint convocatoria_players_rol_orden_coherente
  on public.convocatoria_players is
  'Fase 9 v2: filas activas (no declinadas) deben respetar rol/orden coherente. Filas declinadas pueden tener cualquier combinacion porque salen del roster activo.';
