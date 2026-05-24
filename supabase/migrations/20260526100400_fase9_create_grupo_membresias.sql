-- ============================================================================
-- Fase 9 PR 1: tabla grupo_membresias (titulares + cola FIFO de suplentes)
-- ============================================================================
--
-- Define la relacion persistente jugador <-> grupo. Cada row es una membresia
-- con tipo (titular o suplente) y orden (FIFO si suplente).
--
-- Reglas operativas (ver docs/fase-9-diseno.md):
--   - Un jugador no puede estar dos veces activo en el mismo grupo.
--     Constraint: unique (grupo_id, player_id) where status='activo'.
--   - Si tipo='suplente', orden es la posicion en la cola FIFO (1=primero).
--     Si tipo='titular', orden es null (no significa nada).
--   - Cuando un titular se baja de una convocatoria, pierde su titularidad
--     permanente: su membresia pasa a status='inactivo' y el primer suplente
--     activo asciende a titular. Esta logica se implementa en PR 11 (server
--     action), pero la tabla soporta el modelo.
--   - Un ex-titular puede volver desde /mi-perfil "Anotarme en la cola":
--     crea una membresia nueva con tipo='suplente', orden=max+1 (o
--     reactiva la existente; decision a tomar en el server action de PR 9).
--
-- En PR 1 solo creamos la tabla + RLS basica. La logica de promocion y
-- reordenamiento de cola va en PRs posteriores.
-- ============================================================================

-- 1. Enums -------------------------------------------------------------------
create type public.membresia_tipo as enum ('titular', 'suplente');
create type public.membresia_status as enum ('activo', 'inactivo');

-- 2. Tabla -------------------------------------------------------------------
create table public.grupo_membresias (
  id               uuid primary key default gen_random_uuid(),
  grupo_id         uuid not null references public.grupos(id) on delete cascade,
  player_id        uuid not null references public.players(id) on delete restrict,
  tipo             public.membresia_tipo not null,
  orden            int,
  status           public.membresia_status not null default 'activo',
  joined_at        timestamptz not null default now(),
  inactivated_at   timestamptz,
  inactivated_by   uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Si es suplente activo, debe tener orden.
  -- Si es titular activo o inactivo, orden puede ser null.
  -- Si es suplente inactivo, dejamos pasar (puede mantener orden historico).
  check (
    (tipo = 'suplente' and status = 'activo' and orden is not null)
    or (tipo = 'titular')
    or (status = 'inactivo')
  )
);

comment on table public.grupo_membresias is
  'Fase 9: relacion persistente jugador <-> grupo. Titulares y cola FIFO de suplentes.';
comment on column public.grupo_membresias.orden is
  'Solo significa algo si tipo=suplente. 1=primero en la cola. Null para titulares activos.';

-- Un jugador no puede tener dos membresias activas en el mismo grupo.
create unique index grupo_membresias_grupo_player_activo_unique
  on public.grupo_membresias (grupo_id, player_id)
  where status = 'activo';

-- Suplentes activos tienen orden unico dentro del grupo.
create unique index grupo_membresias_grupo_orden_suplente_activo_unique
  on public.grupo_membresias (grupo_id, orden)
  where status = 'activo' and tipo = 'suplente';

create index grupo_membresias_grupo_idx          on public.grupo_membresias (grupo_id);
create index grupo_membresias_player_idx         on public.grupo_membresias (player_id);
create index grupo_membresias_grupo_tipo_status_idx
  on public.grupo_membresias (grupo_id, tipo, status);

-- 3. Trigger updated_at ------------------------------------------------------
create or replace function public.grupo_membresias_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.grupo_membresias_set_updated_at() from public;

create trigger grupo_membresias_touch_updated_at
  before update on public.grupo_membresias
  for each row
  execute function public.grupo_membresias_set_updated_at();

-- 4. RLS ---------------------------------------------------------------------
alter table public.grupo_membresias enable row level security;

-- SELECT: admin y veedor. Player ve sus propias membresias y las de su grupo
-- via la view players_public en PR 2.
create policy grupo_membresias_select_admin_veedor
  on public.grupo_membresias
  for select
  to authenticated
  using (public.current_user_role() in ('admin', 'veedor'));

-- INSERT: solo admin.
create policy grupo_membresias_insert_admin
  on public.grupo_membresias
  for insert
  to authenticated
  with check (public.current_user_role() = 'admin');

-- UPDATE: solo admin.
create policy grupo_membresias_update_admin
  on public.grupo_membresias
  for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- DELETE: bloqueado. Para "sacar" un miembro, se setea status='inactivo'.
