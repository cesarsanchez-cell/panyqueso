-- ============================================================================
-- FUT-106 (Fase 11, Bloque 2, 2a): rol coordinador + coordinador_grupos + helper
-- ============================================================================
--
-- Base del rol "gestor/coordinador de grupo": mismas funciones que el admin pero
-- acotado a los grupos que se le asignan. Esta migración crea la fundación de
-- permisos; el rescopeo de RLS/funciones va en 2b (FUT-107) y la UI en 2c.
--
-- Diseño:
--   - public.user_role gana el valor 'coordinador' (para el gate de app / UI).
--   - coordinador_grupos (profile_id, grupo_id): qué grupos gestiona cada quién.
--   - can_manage_grupo(grupo_id) = admin (cualquier grupo) O asignado a ESE grupo.
--     Es el chequeo único que en 2b reemplaza al "es admin" en todo lo operativo.
--
-- ⚠️ El valor de enum nuevo NO se USA en esta misma transacción (Postgres no deja
-- usar un valor recién agregado hasta commitear). can_manage_grupo NO referencia
-- 'coordinador': se basa en la PRESENCIA en coordinador_grupos. Así la migración
-- corre en una sola transacción sin el error "unsafe use of new value".
-- ============================================================================

-- 1. Valor de enum nuevo (no se usa acá; queda disponible tras el commit).
alter type public.user_role add value if not exists 'coordinador';

-- 2. Tabla de asignación coordinador <-> grupo --------------------------------
create table public.coordinador_grupos (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  grupo_id    uuid not null references public.grupos(id)   on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) on delete set null,
  unique (profile_id, grupo_id)
);

comment on table public.coordinador_grupos is
  'FUT-106: qué grupos gestiona cada coordinador (1–3, no todos). La autoridad operativa se chequea con can_manage_grupo(); el rol coordinador en profiles.role es para el gate de la app.';

create index coordinador_grupos_grupo_idx   on public.coordinador_grupos (grupo_id);
create index coordinador_grupos_profile_idx on public.coordinador_grupos (profile_id);

-- 3. Helper de autoridad por grupo -------------------------------------------
-- admin = manda en todos los grupos; coordinador = solo en los suyos.
-- No referencia el literal 'coordinador' (usa la presencia en coordinador_grupos),
-- así esta migración no "usa" el valor de enum recién agregado.
create or replace function public.can_manage_grupo(p_grupo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.current_user_role() = 'admin'
    or exists (
      select 1
        from public.coordinador_grupos cg
       where cg.profile_id = auth.uid()
         and cg.grupo_id = p_grupo_id
    );
$$;

comment on function public.can_manage_grupo(uuid) is
  'FUT-106: true si el usuario logueado puede gestionar el grupo: admin (todos) o coordinador asignado a ese grupo. Reemplaza el "es admin" en lo operativo (2b).';

revoke all on function public.can_manage_grupo(uuid) from public;
grant execute on function public.can_manage_grupo(uuid) to authenticated;

-- 4. RLS de coordinador_grupos -----------------------------------------------
alter table public.coordinador_grupos enable row level security;

-- SELECT: admin ve todo; cada quién ve sus propias asignaciones.
create policy coordinador_grupos_select
  on public.coordinador_grupos
  for select
  to authenticated
  using (public.current_user_role() = 'admin' or profile_id = auth.uid());

-- INSERT/UPDATE/DELETE: solo admin (la UI de asignación es admin, en 2c).
create policy coordinador_grupos_insert_admin
  on public.coordinador_grupos
  for insert
  to authenticated
  with check (public.current_user_role() = 'admin');

create policy coordinador_grupos_update_admin
  on public.coordinador_grupos
  for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy coordinador_grupos_delete_admin
  on public.coordinador_grupos
  for delete
  to authenticated
  using (public.current_user_role() = 'admin');
