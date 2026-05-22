-- ============================================================================
-- FUT-18: tabla audit_log
-- ============================================================================
--
-- Plan v4 seccion 2: registro liviano de acciones no-sensibles (creacion de
-- jugador, cambio de notas privadas, confirmacion de partido, aprobaciones
-- aplicadas por las funciones SECURITY DEFINER, etc.).
--
-- Separada de player_change_requests para evitar mezclar:
--   - change_requests: estado mutable, flujo de aprobacion.
--   - audit_log:       inmutable, append-only, hechos consumados.
--
-- Politica de acceso:
--   - SELECT: admin + veedor (reusa public.current_user_role() de FUT-9).
--   - INSERT: BLOQUEADO para clientes. Solo via funciones SECURITY DEFINER
--             (FUT-20 approve, FUT-21 reject, FUT-22 flag, etc.).
--   - UPDATE/DELETE: BLOQUEADO (log es append-only).
-- ============================================================================

-- 1. Tabla --------------------------------------------------------------------
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),

  -- Quien ejecuto la accion. NULL si fue una accion de sistema o si el
  -- profile fue borrado (ON DELETE SET NULL preserva el registro).
  actor_id    uuid references public.profiles(id) on delete set null,

  -- Entidad y subject. Generico para soportar cualquier tipo de accion sin
  -- tener que agregar columnas. Convenciones:
  --   entity:    'player', 'player_change_request', 'match', 'convocatoria',
  --              'profile', etc.
  --   entity_id: id de la entidad. NULL para acciones sobre coleccion o sin
  --              subject especifico.
  --   action:    nombre tecnico de la accion. Convencion: snake_case verbal.
  --              Ej: 'approve_change_request', 'reject_change_request',
  --              'update_private_notes', 'confirm_match'.
  entity      text not null check (length(trim(entity)) > 0),
  entity_id   uuid,
  action      text not null check (length(trim(action)) > 0),

  -- Payload JSON con detalle de la accion. Estructura libre por entity/action.
  -- Las funciones SECURITY DEFINER son responsables de incluir aca lo que
  -- valga la pena auditar (ej: old vs new para updates, snapshot del request
  -- aprobado, etc.).
  payload     jsonb,

  created_at  timestamptz not null default now()
);

comment on table public.audit_log is
  'Bitacora append-only de acciones no-sensibles. Inserts solo via funciones SECURITY DEFINER. UPDATE/DELETE bloqueados.';
comment on column public.audit_log.action is
  'Convencion: snake_case verbal. Ej: approve_change_request, update_private_notes, confirm_match.';

-- 2. Indices ------------------------------------------------------------------
-- Listado global ordenado por tiempo (vista del veedor).
create index audit_log_created_at_idx
  on public.audit_log (created_at desc);

-- Historial de una entidad especifica (ej. ver todo lo que paso al player X).
create index audit_log_entity_idx
  on public.audit_log (entity, entity_id, created_at desc)
  where entity_id is not null;

-- Actividad por usuario.
create index audit_log_actor_idx
  on public.audit_log (actor_id, created_at desc)
  where actor_id is not null;

-- Filtros por tipo de accion (ej. ver todas las aprobaciones).
create index audit_log_action_idx
  on public.audit_log (action, created_at desc);

-- 3. RLS ----------------------------------------------------------------------
alter table public.audit_log enable row level security;

-- SELECT: admin y veedor. Reusa la funcion helper de FUT-9.
create policy audit_log_select_admin_veedor
  on public.audit_log
  for select
  to authenticated
  using (public.current_user_role() in ('admin', 'veedor'));

-- INSERT, UPDATE, DELETE: SIN policies => bloqueados para clientes.
-- Solo funciones SECURITY DEFINER (FUT-20+) podran insertar.
