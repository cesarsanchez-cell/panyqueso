-- ============================================================================
-- FUT-9: tabla profiles + trigger de auto-creacion + RLS basica
-- ============================================================================
--
-- Plan v4 seccion 2:
--   profiles (id FK auth.users, nombre, role enum admin|veedor, created_at)
--   Trigger auto-crear profile al signup.
--   RLS: cada uno su perfil; admin+veedor leen todos.
--
-- Notas de diseno:
-- - nombre y role son NULLABLE: cuando Supabase Auth crea un user, el trigger
--   crea el profile vacio. El admin completa nombre+role despues (en el MVP,
--   manualmente via SQL editor; con UI propia en fases posteriores).
-- - Un usuario sin role no podra usar la app: el middleware de Fase 1 (FUT-10)
--   redirige a una pantalla de "esperando asignacion de rol".
-- - La policy admin/veedor usa una funcion helper SECURITY DEFINER para evitar
--   recursion (sin la funcion, leer profiles desde una policy sobre profiles
--   es loop).
-- ============================================================================

-- 1. Enum de roles ----------------------------------------------------------
create type public.user_role as enum ('admin', 'veedor');

-- 2. Tabla profiles ---------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nombre     text,
  role       public.user_role,
  created_at timestamptz not null default now()
);

comment on table  public.profiles is
  'Perfil extendido de cada usuario authenticado. nombre y role los completa el admin tras el signup.';
comment on column public.profiles.role is
  'admin: gestion total. veedor: revisa cambios sensibles. NULL: usuario sin rol asignado, no puede operar.';

-- 3. RLS --------------------------------------------------------------------
alter table public.profiles enable row level security;

-- 3.a. Cada usuario lee su propio perfil
create policy profiles_select_self
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- 3.b. Admin y veedor leen TODOS los perfiles (incluye el propio via el de arriba)
-- Funcion helper para evitar recursion en la policy.
create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
set search_path = ''
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

create policy profiles_select_admin_veedor
  on public.profiles
  for select
  to authenticated
  using (public.current_user_role() in ('admin', 'veedor'));

-- NO se define policy de INSERT: profiles se crean via trigger del signup,
-- nunca por el cliente.
-- NO se define policy de UPDATE/DELETE en este PR: la asignacion de role
-- la hace el admin via SQL editor en el MVP. UPDATE policies entran en
-- fases posteriores cuando haya UI de admin.

-- 4. Trigger de auto-creacion al signup ------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
