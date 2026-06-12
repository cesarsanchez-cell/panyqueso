-- ============================================================================
-- FUT-108: tests de lectura del coordinador (players + ratings + requests)
-- ============================================================================
-- El coordinador ve SOLO lo de sus grupos:
--   1-4. players: admin ve todos; coordinador ve a los miembros de su grupo y
--        NO a los de otro grupo.
--   5-6. player_group_ratings: admin ve todos; coordinador solo los de su grupo.
--   7-8. player_change_requests: coordinador ve los de su grupo, NO el de otro
--        grupo ni los globales (grupo_id null).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

select plan(8);

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'admin-pc@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'coord-pc@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',       nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'coordinador', nombre = 'Coord' where id = '00000000-0000-0000-0000-0000000000a2';

insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved',
   '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b2', 'P2', 28, 'jugador_campo', 'delantero', 6, 6, 6, 'approved',
   '00000000-0000-0000-0000-0000000000a1');

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

-- b1 miembro de e1, b2 miembro de e2 (el trigger siembra player_group_ratings).
insert into public.grupo_membresias (grupo_id, player_id, tipo) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'titular'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b2', 'titular');

-- Solicitudes de cambio: una de e1, una de e2, una global (grupo_id null).
insert into public.player_change_requests (
  player_id, grupo_id, action_type, requested_by, proposed_values, reason
) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e1',
   'update_sensitive_fields', '00000000-0000-0000-0000-0000000000a1', '{"phys_power":7}'::jsonb, 'seed e1'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000e2',
   'update_sensitive_fields', '00000000-0000-0000-0000-0000000000a1', '{"phys_power":7}'::jsonb, 'seed e2'),
  ('00000000-0000-0000-0000-0000000000b1', null,
   'update_sensitive_fields', '00000000-0000-0000-0000-0000000000a1', '{"technical":7}'::jsonb, 'seed global');

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

-- 1. admin ve los dos jugadores.
select _as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.players), 2, 'admin ve todos los jugadores');

-- 2-4. coordinador ve solo al miembro de su grupo.
select _as('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.players), 1, 'coordinador ve solo los jugadores de su grupo');
select is(
  (select count(*)::int from public.players where id = '00000000-0000-0000-0000-0000000000b1'),
  1, 'coordinador ve al jugador de su grupo');
select is(
  (select count(*)::int from public.players where id = '00000000-0000-0000-0000-0000000000b2'),
  0, 'coordinador NO ve al jugador de otro grupo');

-- 5-6. player_group_ratings.
select _as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.player_group_ratings), 2, 'admin ve todos los ratings de grupo');
select _as('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from public.player_group_ratings), 1, 'coordinador ve solo el rating de su grupo');

-- 7-8. player_change_requests.
select is(
  (select count(*)::int from public.player_change_requests),
  1, 'coordinador ve solo las solicitudes de su grupo');
select is(
  (select count(*)::int from public.player_change_requests where grupo_id is null),
  0, 'coordinador NO ve las solicitudes globales');

select * from finish();
rollback;
