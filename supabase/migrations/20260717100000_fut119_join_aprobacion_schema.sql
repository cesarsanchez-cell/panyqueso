-- ============================================================================
-- FUT-119 (Fase 13 / F1): gate de aprobación OPCIONAL por grupo para el link /g
-- ============================================================================
--
-- El link único de grupo (/g/<token>) hoy AUTO-APRUEBA al que se anota. Esto
-- agrega un toggle POR GRUPO (como "veedor opcional"): si está prendido, el que
-- entra por el link queda PENDING y el admin/coordinador lo aprueba antes de que
-- sea miembro. Default OFF → no cambia el comportamiento actual.
--
-- Schema acá; la lógica (claim_group_join con gate + aprobar/rechazar) va en la
-- migración de RPCs que sigue.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Toggle por grupo
-- ---------------------------------------------------------------------------
alter table public.grupos
  add column if not exists join_requiere_aprobacion boolean not null default false;

comment on column public.grupos.join_requiere_aprobacion is
  'FUT-119: si true, el que entra por el link /g queda pending y el admin lo aprueba (grupo_join_requests). Default false = auto-aprobar (comportamiento histórico).';

-- ---------------------------------------------------------------------------
-- 2. Estado de la solicitud
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'join_request_status') then
    create type public.join_request_status as enum ('pendiente', 'aprobada', 'rechazada');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Tabla de solicitudes de alta
-- ---------------------------------------------------------------------------
create table if not exists public.grupo_join_requests (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,
  status      public.join_request_status not null default 'pendiente',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);

-- Un jugador no puede tener dos solicitudes pendientes en el mismo grupo.
create unique index if not exists grupo_join_requests_pending_unique
  on public.grupo_join_requests (grupo_id, player_id)
  where status = 'pendiente';

create index if not exists grupo_join_requests_grupo_status_idx
  on public.grupo_join_requests (grupo_id, status);

comment on table public.grupo_join_requests is
  'FUT-119: solicitudes de alta vía link /g cuando el grupo requiere aprobación. El alta crea un player pending + esta fila; el admin aprueba (crea membresía) o rechaza.';

-- ---------------------------------------------------------------------------
-- 4. RLS: deny-all directo. Todo el acceso pasa por RPCs SECURITY DEFINER
--    (claim_group_join inserta; listar/aprobar/rechazar leen-resuelven con gate
--    can_manage_grupo). Así no dependemos de la RLS de players para la cola.
-- ---------------------------------------------------------------------------
alter table public.grupo_join_requests enable row level security;
-- (sin policies: el rol authenticated/anon no toca la tabla directo)
