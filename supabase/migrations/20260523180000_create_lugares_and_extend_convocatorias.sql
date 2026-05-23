-- ============================================================================
-- Fase 5 PR 1: tabla `lugares` + nuevos campos en `convocatorias`
-- ============================================================================
--
-- Plan v4 Fase 5: el admin gestiona una lista de lugares (canchas) y los
-- asigna a cada convocatoria. Sumamos hora y cupo_maximo, que faltaban para
-- operar.
--
-- Decisiones:
--   - lugares.nombre: trim != '' obligatorio. Unique case-insensitive
--     (lower(nombre)) para evitar duplicados por capitalizacion distinta.
--   - lugar_id en convocatorias es nullable: admin puede crear la
--     convocatoria sin definir lugar todavia.
--   - cupo_maximo not null default 12. Check 10..24 segun CLAUDE.md
--     ("5 a 12 jugadores por equipo" -> 10 min, 24 max).
--   - hora time not null default '20:00'. El admin puede pisar el default
--     en el form.
--   - DELETE bloqueado en lugares (sin policy). Si un lugar queda
--     desuso, se queda en la tabla sin perjuicio.
--   - ON DELETE RESTRICT en lugar_id: no se puede borrar un lugar en uso.
--     (Por ahora DELETE esta bloqueado igual; queda como defensa por si se
--     habilita en el futuro.)
-- ============================================================================

-- 1. Tabla lugares -----------------------------------------------------------
create table public.lugares (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (length(trim(nombre)) > 0),
  created_by  uuid not null references public.profiles(id) on delete restrict,
  created_at  timestamptz not null default now()
);

comment on table public.lugares is
  'Fase 5 PR 1: catalogo de lugares (canchas) administrado por el admin.';

-- Unique case-insensitive: "Cancha Norte" == "cancha norte".
create unique index lugares_nombre_lower_unique
  on public.lugares (lower(nombre));

create index lugares_created_at_idx
  on public.lugares (created_at desc);

-- 2. RLS en lugares ----------------------------------------------------------
alter table public.lugares enable row level security;

-- SELECT: admin y veedor (veedor lo necesita para leer convocatorias).
create policy lugares_select_admin_veedor
  on public.lugares
  for select
  to authenticated
  using (public.current_user_role() in ('admin', 'veedor'));

-- INSERT: solo admin. Trigger fuerza created_by = auth.uid().
create policy lugares_insert_admin
  on public.lugares
  for insert
  to authenticated
  with check (public.current_user_role() = 'admin');

-- UPDATE: solo admin (por si en el futuro hace falta renombrar).
create policy lugares_update_admin
  on public.lugares
  for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- DELETE: sin policy -> bloqueado.

-- 3. Trigger: forzar created_by = auth.uid() en INSERT --------------------
create or replace function public.lugares_normalize_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

comment on function public.lugares_normalize_insert() is
  'Fase 5 PR 1: fuerza lugares.created_by = auth.uid() en INSERT (defensa contra spoofing).';

revoke all on function public.lugares_normalize_insert() from public;

create trigger lugares_normalize_insert
  before insert on public.lugares
  for each row
  execute function public.lugares_normalize_insert();

-- 4. Extender convocatorias ---------------------------------------------------
alter table public.convocatorias
  add column hora time not null default '20:00',
  add column lugar_id uuid references public.lugares(id) on delete restrict,
  add column cupo_maximo int not null default 12
    check (cupo_maximo between 10 and 24);

comment on column public.convocatorias.hora is
  'Hora de inicio del partido. Default 20:00 (fútbol de los martes).';
comment on column public.convocatorias.lugar_id is
  'Lugar (cancha) donde se juega. Nullable: admin puede crear la convocatoria sin definirlo todavia.';
comment on column public.convocatorias.cupo_maximo is
  'Cantidad maxima de convocados. Check 10..24 segun "5 a 12 por equipo" del plan v4.';

create index convocatorias_lugar_idx
  on public.convocatorias (lugar_id)
  where lugar_id is not null;
