-- ============================================================================
-- FUT-106: tests del rol coordinador (can_manage_grupo + RLS coordinador_grupos)
-- ============================================================================
-- Cubre:
--   1-2. admin gestiona TODOS los grupos.
--   3-4. coordinador gestiona SOLO su grupo asignado (no otros).
--   5.   un player sin asignación no gestiona nada.
--   6-8. RLS de coordinador_grupos: admin ve todo, cada quién ve lo suyo, el
--        player no ve nada.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

select plan(8);

-- a1 admin, a2 coordinador (asignado a e1), a3 player (sin asignación).
insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'admin-coord@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'coord@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000000',
   'player-coord@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',       nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'coordinador', nombre = 'Coord' where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set role = 'player',      nombre = 'P1'    where id = '00000000-0000-0000-0000-0000000000a3';

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6,
   '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e2', 'Grupo e2', '00000000-0000-0000-0000-00000000000a', 4, '21:00', 6,
   '00000000-0000-0000-0000-0000000000a1');

-- a2 coordina e1 (no e2).
insert into public.coordinador_grupos (profile_id, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000a1');

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

-- 1-2. admin gestiona todos.
select _as('00000000-0000-0000-0000-0000000000a1');
select ok(
  public.can_manage_grupo('00000000-0000-0000-0000-0000000000e1'),
  'admin gestiona e1'
);
select ok(
  public.can_manage_grupo('00000000-0000-0000-0000-0000000000e2'),
  'admin gestiona e2 (todos)'
);

-- 3-4. coordinador gestiona solo el suyo.
select _as('00000000-0000-0000-0000-0000000000a2');
select ok(
  public.can_manage_grupo('00000000-0000-0000-0000-0000000000e1'),
  'coordinador gestiona su grupo (e1)'
);
select ok(
  not public.can_manage_grupo('00000000-0000-0000-0000-0000000000e2'),
  'coordinador NO gestiona un grupo ajeno (e2)'
);

-- 5. player sin asignación no gestiona nada.
select _as('00000000-0000-0000-0000-0000000000a3');
select ok(
  not public.can_manage_grupo('00000000-0000-0000-0000-0000000000e1'),
  'un player sin asignación no gestiona ningún grupo'
);

-- 6. RLS: admin ve todas las asignaciones.
select _as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from public.coordinador_grupos),
  1,
  'RLS: el admin ve todas las asignaciones'
);

-- 7. RLS: el coordinador ve la suya.
select _as('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from public.coordinador_grupos),
  1,
  'RLS: el coordinador ve su propia asignación'
);

-- 8. RLS: el player no ve nada.
select _as('00000000-0000-0000-0000-0000000000a3');
select is(
  (select count(*)::int from public.coordinador_grupos),
  0,
  'RLS: el player no ve asignaciones'
);

select * from finish();
rollback;
