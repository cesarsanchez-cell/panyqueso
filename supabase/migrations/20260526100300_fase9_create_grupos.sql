-- ============================================================================
-- Fase 9 PR 1: tabla grupos (entidad recurrente)
-- ============================================================================
--
-- El grupo es la unidad continua: "Martes 20hs en La Cancha del Tano".
-- Las convocatorias semanales se generan dentro de un grupo, heredando su
-- lugar/dia/hora. Las membresias (titular/suplente) viven en grupo_membresias
-- (migracion siguiente) y persisten semana a semana.
--
-- Decisiones:
--   - dia_semana int 0-6 (0=domingo, 6=sabado) siguiendo convencion ISO/JS.
--   - cupo_titulares default 12, check 6..24 (un equipo de 5v5 al menos).
--   - owner_id apunta a profiles (admin que creo el grupo). on delete restrict
--     para no perder owners.
--   - status enum activo/archivado: archivado oculta el grupo de listas
--     normales pero conserva historial.
--   - SIN unique en (lugar_id, dia_semana, hora): puede haber dos grupos
--     legitimos el mismo dia/hora en lugares distintos, y conceptualmente
--     incluso en el mismo lugar (raro pero no imposible).
-- ============================================================================

-- 1. Enum de status del grupo ------------------------------------------------
create type public.grupo_status as enum ('activo', 'archivado');

-- 2. Tabla grupos ------------------------------------------------------------
create table public.grupos (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null check (length(trim(nombre)) > 0),
  lugar_id         uuid not null references public.lugares(id) on delete restrict,
  dia_semana       int  not null check (dia_semana between 0 and 6),
  hora             time not null default '20:00',
  cupo_titulares   int  not null default 12 check (cupo_titulares between 6 and 24),
  owner_id         uuid not null references public.profiles(id) on delete restrict,
  status           public.grupo_status not null default 'activo',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.grupos is
  'Fase 9: entidad recurrente que agrupa convocatorias semanales (mismo lugar/dia/hora). Sus membresias persisten en grupo_membresias.';
comment on column public.grupos.dia_semana is
  '0=domingo, 1=lunes, ..., 6=sabado (convencion JS getDay / Postgres extract(dow)).';

create index grupos_lugar_idx       on public.grupos (lugar_id);
create index grupos_status_idx      on public.grupos (status);
create index grupos_owner_idx       on public.grupos (owner_id);

-- 3. Trigger updated_at ------------------------------------------------------
create or replace function public.grupos_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.grupos_set_updated_at() from public;

create trigger grupos_touch_updated_at
  before update on public.grupos
  for each row
  execute function public.grupos_set_updated_at();

-- 4. RLS ---------------------------------------------------------------------
alter table public.grupos enable row level security;

-- SELECT: admin y veedor ven todos los grupos.
-- Player ve solo grupos en los que tiene membresia activa. La policy para
-- player se agrega cuando se cree la tabla grupo_membresias y la view
-- players_public (PR 2). En PR 1, player no tiene SELECT.
create policy grupos_select_admin_veedor
  on public.grupos
  for select
  to authenticated
  using (public.current_user_role() in ('admin', 'veedor'));

-- INSERT: solo admin. owner_id se setea via trigger / server action.
create policy grupos_insert_admin
  on public.grupos
  for insert
  to authenticated
  with check (public.current_user_role() = 'admin');

-- UPDATE: solo admin.
create policy grupos_update_admin
  on public.grupos
  for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- DELETE: bloqueado. Para "borrar" un grupo se cambia status='archivado'.
