-- ============================================================================
-- Fase 9 follow-up: convocatoria_players gana rol_en_convocatoria y
-- orden_suplente
-- ============================================================================
--
-- Hasta hoy convocatoria_players solo trackeaba attendance_status. El roster
-- "titulares + suplentes" se derivaba de grupo_membresias. Eso confunde el
-- modelo: el grupo es permanente, la convocatoria es por partido.
--
-- A partir de este cambio, la convocatoria tiene su PROPIO roster:
--   - rol_en_convocatoria (titular | suplente): rol del jugador en ESE
--     partido. Independiente de su rol permanente en grupo_membresias.
--   - orden_suplente (NULL si titular; 1..N FIFO si suplente): posicion
--     en la cola de suplentes DE ESA CONVOCATORIA.
--
-- Al bootstrap, se copian los titulares + suplentes del grupo con su orden.
-- Despues, las decisiones por convocatoria (decline, undo, suba de suplente)
-- modifican rol/orden DENTRO de la convocatoria sin tocar el grupo.
--
-- Constraint: rol='titular' <=> orden_suplente IS NULL.
-- Unique index parcial: una sola posicion por orden, ignorando declinados.
--
-- Backfill: todas las filas existentes son titulares (asi fue el modelo
-- hasta ahora). orden_suplente queda NULL.
-- ============================================================================

alter table public.convocatoria_players
  add column rol_en_convocatoria public.membresia_tipo,
  add column orden_suplente int;

-- Backfill: todas las filas existentes nacieron como titulares en bootstrap.
update public.convocatoria_players
   set rol_en_convocatoria = 'titular'
 where rol_en_convocatoria is null;

alter table public.convocatoria_players
  alter column rol_en_convocatoria set not null;

-- Coherencia rol/orden.
alter table public.convocatoria_players
  add constraint convocatoria_players_rol_orden_coherente
  check (
    (rol_en_convocatoria = 'titular' and orden_suplente is null)
    or
    (rol_en_convocatoria = 'suplente' and orden_suplente is not null and orden_suplente > 0)
  );

-- Unique orden por convocatoria entre suplentes activos (no declinados).
create unique index convocatoria_players_suplente_orden_uq
  on public.convocatoria_players (convocatoria_id, orden_suplente)
  where rol_en_convocatoria = 'suplente'
    and attendance_status <> 'declinado';

-- Indice de busqueda por convocatoria + rol (para listar titulares o cola).
create index convocatoria_players_conv_rol_idx
  on public.convocatoria_players (convocatoria_id, rol_en_convocatoria);

comment on column public.convocatoria_players.rol_en_convocatoria is
  'Fase 9: rol del jugador en esta convocatoria especifica (titular | suplente). Independiente del rol en grupo_membresias. Se inicializa en bootstrap copiando del grupo y puede cambiar por decline/undo/sube-suplente sin tocar el grupo.';

comment on column public.convocatoria_players.orden_suplente is
  'Fase 9: posicion en la cola de suplentes de esta convocatoria (1..N FIFO). NULL si rol=titular. Independiente del orden en grupo_membresias.';
