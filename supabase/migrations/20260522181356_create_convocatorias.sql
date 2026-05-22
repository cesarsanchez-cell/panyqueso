-- ============================================================================
-- Migracion: convocatorias + convocatoria_players
-- ============================================================================
--
-- Plan v4 seccion 2/4. Modela una convocatoria a partido: fecha + lista de
-- jugadores invitados con su estado de asistencia.
--
-- Flujo (Fase 5):
--   1. Admin crea convocatoria con status='abierta'.
--   2. Admin agrega/quita jugadores (solo approved). attendance arranca
--      en 'pendiente'.
--   3. Players (en el MVP, el admin en su nombre) marcan
--      confirmado/declinado.
--   4. Cuando hay >= 10 confirmados, se habilita el generador.
--   5. Tras confirmar el partido, status pasa a 'jugada'.
--   6. 'cancelada' es opcional para descartar la convocatoria.
--
-- RLS: habilitado SIN policies aca. Las policies entran en la migracion de
-- "RLS convocatorias/matches" (SELECT admin+veedor, INSERT/UPDATE solo admin,
-- DELETE bloqueado). Sin policies, RLS bloquea todo para clientes.
-- ============================================================================

-- 1. Enums --------------------------------------------------------------------
create type public.convocatoria_status as enum (
  'abierta',
  'cerrada',
  'jugada',
  'cancelada'
);

create type public.attendance_status as enum (
  'pendiente',
  'confirmado',
  'declinado',
  'ausente_sin_aviso'
);

-- 2. Tabla convocatorias ------------------------------------------------------
create table public.convocatorias (
  id          uuid primary key default gen_random_uuid(),

  fecha       date not null,
  notas       text,

  status      public.convocatoria_status not null default 'abierta',

  -- created_by NOT NULL: toda convocatoria tiene autor identificable. ON
  -- DELETE RESTRICT impide borrar un profile que dejo convocatorias colgadas.
  created_by  uuid not null references public.profiles(id) on delete restrict,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.convocatorias is
  'Convocatoria a un partido: fecha + lista de jugadores invitados. Una convocatoria abierta puede pasar a cerrada/jugada/cancelada.';

create index convocatorias_fecha_idx
  on public.convocatorias (fecha desc);
create index convocatorias_status_idx
  on public.convocatorias (status, fecha desc);

-- 3. Tabla convocatoria_players ----------------------------------------------
create table public.convocatoria_players (
  id                uuid primary key default gen_random_uuid(),

  convocatoria_id   uuid not null
                    references public.convocatorias(id) on delete cascade,

  -- ON DELETE RESTRICT: no permitir borrar un player que esta en una
  -- convocatoria. Las desactivaciones pasan por player_change_request
  -- (action=deactivate_player) que cambia status, no borra el row.
  player_id         uuid not null
                    references public.players(id) on delete restrict,

  attendance_status public.attendance_status not null default 'pendiente',

  added_at          timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (convocatoria_id, player_id)
);

comment on table public.convocatoria_players is
  'Lista de jugadores invitados a una convocatoria con su estado de asistencia. El INSERT exige player.status=approved (trigger).';

create index convocatoria_players_convocatoria_idx
  on public.convocatoria_players (convocatoria_id);
create index convocatoria_players_player_idx
  on public.convocatoria_players (player_id);

-- 4. Trigger: validar que el player esta approved antes de invitarlo --------
-- Defense in depth contra agregar jugadores pending/inactive. Plan v4: "solo
-- jugadores approved son convocables".
create or replace function public.convocatoria_players_validate_player()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status public.player_status;
begin
  select status into v_status
  from public.players
  where id = new.player_id;

  if v_status is null then
    raise exception 'player_not_found'
      using errcode = 'P0030';
  end if;

  if v_status <> 'approved' then
    raise exception 'player_not_approved'
      using errcode = 'P0031', detail = v_status::text;
  end if;

  return new;
end;
$$;

comment on function public.convocatoria_players_validate_player() is
  'Rechaza INSERT en convocatoria_players si el player no esta approved. P0030 si no existe, P0031 si existe pero status != approved.';

revoke all on function public.convocatoria_players_validate_player() from public;

create trigger convocatoria_players_validate_player_insert
  before insert on public.convocatoria_players
  for each row
  execute function public.convocatoria_players_validate_player();

-- 5. RLS habilitado sin policies (se cierra en la migracion de RLS) ---------
alter table public.convocatorias enable row level security;
alter table public.convocatoria_players enable row level security;
