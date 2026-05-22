-- ============================================================================
-- FUT-17: tabla player_change_requests
-- ============================================================================
--
-- Plan v4 seccion 2: propuestas pendientes de aprobacion del veedor para
-- cualquier cambio sensible de un player (incluye alta, updates de ratings,
-- desactivacion y reactivacion).
--
-- Esta migracion solo crea la tabla y sus CHECKs de coherencia.
--
-- Triggers de seguridad relacionados (NO entran en este PR):
--   - FUT-24: normalizacion en INSERT (forzar status='pending' y nullear
--     reviewed_by/reviewed_at/review_comment/created_player_id).
--   - FUT-25: inmutabilidad post-decision (una vez approved/rejected, el row
--     no admite UPDATE).
--
-- RLS policies para esta tabla entran en FUT-26.
--   Por ahora habilitamos RLS sin policies => bloqueado para todos los roles
--   authenticated, lo cual es el default seguro.
--   Las funciones SECURITY DEFINER (FUT-20+) operaran bypasseando RLS.
-- ============================================================================

-- 1. Enums --------------------------------------------------------------------
create type public.change_request_action as enum (
  'create_player',
  'update_sensitive_fields',
  'deactivate_player',
  'reactivate_player'
);

create type public.change_request_status as enum (
  'pending',
  'approved',
  'rejected',
  'flagged'
);

-- 2. Tabla --------------------------------------------------------------------
create table public.player_change_requests (
  id                 uuid primary key default gen_random_uuid(),

  -- Referencias a player:
  --   - player_id: el player afectado. NULL para action_type=create_player
  --     (el player aun no existe). NOT NULL para los otros action_types.
  --   - created_player_id: el id del player creado al aprobar un create_player.
  --     Lo escribe la funcion approve_player_change_request (FUT-20).
  player_id          uuid references public.players(id) on delete cascade,
  created_player_id  uuid references public.players(id) on delete set null,

  action_type        public.change_request_action not null,

  -- Auditoria del request
  requested_by       uuid not null references public.profiles(id) on delete restrict,
  reviewed_by        uuid references public.profiles(id) on delete set null,
  reviewed_at        timestamptz,
  review_comment     text,

  -- Payload del cambio
  old_values         jsonb,
  proposed_values    jsonb not null,
  fields_changed     text[],
  reason             text not null check (length(trim(reason)) > 0),

  -- Estado
  status             public.change_request_status not null default 'pending',

  -- Timestamp
  created_at         timestamptz not null default now(),

  -- ---- CHECKs de coherencia -----------------------------------------------

  -- El veedor que revisa NO puede ser el mismo admin que propuso. Esta regla
  -- la enforcea adicionalmente la funcion approve_player_change_request
  -- (FUT-20) y la policy de UPDATE (FUT-26).
  constraint reviewer_not_requester
    check (reviewed_by is null or reviewed_by is distinct from requested_by),

  -- create_player => player_id IS NULL.
  -- otros action_types => player_id NOT NULL.
  constraint player_id_matches_action
    check (
      (action_type =  'create_player' and player_id is null)
      or (action_type <> 'create_player' and player_id is not null)
    ),

  -- Si status es decidido (approved/rejected/flagged), tiene que existir
  -- evidencia del revisor.
  constraint decided_needs_reviewer
    check (
      status = 'pending'
      or (reviewed_by is not null and reviewed_at is not null)
    ),

  -- Si action_type=create_player y status=approved, created_player_id existe.
  constraint approved_create_has_created_id
    check (
      not (action_type = 'create_player' and status = 'approved' and created_player_id is null)
    )
);

comment on table public.player_change_requests is
  'Propuestas de cambio sensible sobre players. Toda mutacion de campos sensibles pasa por aca + aprobacion del veedor (funciones SECURITY DEFINER de FUT-20).';
comment on column public.player_change_requests.player_id is
  'Player afectado. NULL para create_player (el player aun no existe).';
comment on column public.player_change_requests.created_player_id is
  'Id del player recien creado al aprobar un create_player. Escrito por approve_player_change_request (FUT-20).';
comment on column public.player_change_requests.proposed_values is
  'JSON con el payload propuesto. Para create_player: estructura completa del player. Para update_sensitive_fields: delta con solo los campos cambiados.';
comment on column public.player_change_requests.old_values is
  'JSON con los valores actuales del player previo al cambio. NULL para create_player. Usado para detectar staleness al aprobar.';
comment on column public.player_change_requests.fields_changed is
  'Array de nombres de columna que cambian. Util para indexar y filtrar; principalmente para update_sensitive_fields.';

-- 3. Indices ------------------------------------------------------------------
-- Bandeja del veedor: filtrar por status (especialmente pending y flagged).
create index player_change_requests_status_idx
  on public.player_change_requests (status, created_at desc);

-- Mis solicitudes (admin viendo sus propuestas en curso).
create index player_change_requests_requested_by_idx
  on public.player_change_requests (requested_by, created_at desc);

-- Historial de change_requests de un player.
create index player_change_requests_player_id_idx
  on public.player_change_requests (player_id, created_at desc)
  where player_id is not null;

-- 4. RLS ----------------------------------------------------------------------
-- Habilitado sin policies => bloqueado a todos los roles authenticated.
-- FUT-26 agrega las policies (INSERT por admin, SELECT por admin+veedor,
-- UPDATE bloqueado para clientes y unicamente accesible via funciones).
alter table public.player_change_requests enable row level security;
