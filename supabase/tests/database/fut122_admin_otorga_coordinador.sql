-- ============================================================================
-- FUT-122 (Fase A): el admin otorga/quita el rango de coordinador desde la app
-- ============================================================================
--   1. asignar_coordinador_a_grupo (admin) → el perfil queda role='coordinador'.
--   2. queda la fila en coordinador_grupos.
--   3. asignar de nuevo es idempotente (no duplica, no rompe).
--   4. asignar a un veedor → P0090 (rango excluyente).
--   5. asignar como NO admin → P0013.
--   6. quitar de su único grupo → vuelve a 'player' (tiene ficha de jugador).
--   7. tras quitar, no quedan filas en coordinador_grupos.
--   8. quitar una fila inexistente es idempotente (no rompe).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

-- auth.users dispara el trigger que crea el profile (role NULL).
insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000',
   'admin-coord@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000',
   'cand-coord@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000',
   'veedor-coord@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin Coord'  where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set role = 'player', nombre = 'Cand Coord'   where id = '00000000-0000-0000-0000-0000000000c2';
update public.profiles set role = 'veedor', nombre = 'Veedor Coord' where id = '00000000-0000-0000-0000-0000000000c3';

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000c', 'Cancha Coord', '00000000-0000-0000-0000-0000000000c1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id, status) values
  ('00000000-0000-0000-0000-00000000cc01', 'Grupo Coord', '00000000-0000-0000-0000-00000000000c', 2, '20:00', 10,
   '00000000-0000-0000-0000-0000000000c1', 'activo');

-- El candidato tiene ficha de jugador con su auth_user_id (para que al bajar el
-- rango vuelva a 'player').
insert into public.players (id, nombre, edad, role_field, position_pref, technical, physical, mental, status, phone, auth_user_id, created_by) values
  ('00000000-0000-0000-0000-0000000000cf', 'Cand Coord', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved',
   '+5491155558001', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1');

create or replace function _as(p_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select plan(9);

-- 1. asignar (admin) otorga el rango coordinador
select _as('00000000-0000-0000-0000-0000000000c1');
select public.asignar_coordinador_a_grupo(
  '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000cc01');
reset role;
select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000c2'),
  'coordinador', 'asignar otorga el rango coordinador');

-- 2. queda la vinculación en coordinador_grupos
select is(
  (select count(*) from public.coordinador_grupos
    where profile_id = '00000000-0000-0000-0000-0000000000c2'
      and grupo_id = '00000000-0000-0000-0000-00000000cc01'),
  1::bigint, 'queda la fila en coordinador_grupos');

-- 3. asignar de nuevo es idempotente
select _as('00000000-0000-0000-0000-0000000000c1');
select lives_ok(
  $$ select public.asignar_coordinador_a_grupo(
       '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000cc01') $$,
  'asignar de nuevo no rompe (idempotente)');
reset role;
select is(
  (select count(*) from public.coordinador_grupos
    where profile_id = '00000000-0000-0000-0000-0000000000c2'
      and grupo_id = '00000000-0000-0000-0000-00000000cc01'),
  1::bigint, 'no se duplica la vinculación');

-- 4. asignar a un veedor → P0090
select _as('00000000-0000-0000-0000-0000000000c1');
select throws_ok(
  $$ select public.asignar_coordinador_a_grupo(
       '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-00000000cc01') $$,
  'P0090', null, 'asignar a un veedor dispara P0090');
reset role;

-- 5. asignar como NO admin → P0013
select _as('00000000-0000-0000-0000-0000000000c2');
select throws_ok(
  $$ select public.asignar_coordinador_a_grupo(
       '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000cc01') $$,
  'P0013', null, 'asignar como no-admin dispara P0013');
reset role;

-- guardar el id de la vinculación (superuser) para quitar como admin
select set_config('test.cg',
  (select id::text from public.coordinador_grupos
    where profile_id = '00000000-0000-0000-0000-0000000000c2'
      and grupo_id = '00000000-0000-0000-0000-00000000cc01'),
  true);

-- 6. quitar de su único grupo → vuelve a 'player'
select _as('00000000-0000-0000-0000-0000000000c1');
select public.quitar_coordinador_de_grupo(current_setting('test.cg')::uuid);
reset role;
select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000c2'),
  'player', 'al quitar su último grupo vuelve a player');

-- 7. no quedan vinculaciones
select is(
  (select count(*) from public.coordinador_grupos
    where profile_id = '00000000-0000-0000-0000-0000000000c2'),
  0::bigint, 'no quedan filas en coordinador_grupos');

-- 8. quitar una fila inexistente es idempotente
select _as('00000000-0000-0000-0000-0000000000c1');
select lives_ok(
  $$ select public.quitar_coordinador_de_grupo('00000000-0000-0000-0000-0000000000ff') $$,
  'quitar una fila inexistente no rompe');
reset role;

select * from finish();
rollback;
