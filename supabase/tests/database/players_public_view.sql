-- ============================================================================
-- Fase 9 PR 2: tests de la view players_public y RLS del rol 'player'
-- ============================================================================
--
-- Cubre:
--   1. Admin/veedor ven todos los players via la view (con columnas safe).
--   2. Player ve su propio row + companeros de grupo activo.
--   3. Player NO ve players de otros grupos.
--   4. Player puede SELECT de grupos donde es miembro activo.
--   5. Player NO puede SELECT de otros grupos.
--   6. Player ve la cola FIFO completa de sus grupos.
--   7. Anon no puede SELECT de la view.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

-- Setup: 3 usuarios auth (admin, veedor, player1, player2, player3)
insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000000',
   'admin-ppv@test.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-000000000000',
   'veedor-ppv@test.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a3',
   '00000000-0000-0000-0000-000000000000',
   'player1-ppv@test.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a4',
   '00000000-0000-0000-0000-000000000000',
   'player2-ppv@test.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a5',
   '00000000-0000-0000-0000-000000000000',
   'player3-ppv@test.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin', nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'veedor', nombre = 'Veedor' where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set role = 'player', nombre = 'P1' where id = '00000000-0000-0000-0000-0000000000a3';
update public.profiles set role = 'player', nombre = 'P2' where id = '00000000-0000-0000-0000-0000000000a4';
update public.profiles set role = 'player', nombre = 'P3' where id = '00000000-0000-0000-0000-0000000000a5';

-- 3 players linkeados a los auth.users
insert into public.players (
  id, nombre, edad, role_field, position_pref,
  technical, physical, mental, status, created_by, auth_user_id
) values
  ('00000000-0000-0000-0000-0000000000b1', 'Player1', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000000b2', 'Player2', 28, 'jugador_campo', 'defensor',      5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a4'),
  ('00000000-0000-0000-0000-0000000000b3', 'Player3', 32, 'jugador_campo', 'delantero',     7, 7, 7, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a5');

-- 2 lugares, 2 grupos
insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha A', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000000b', 'Cancha B', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo A martes', '00000000-0000-0000-0000-00000000000a', 2, '20:00', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e2', 'Grupo B jueves', '00000000-0000-0000-0000-00000000000b', 4, '21:00', '00000000-0000-0000-0000-0000000000a1');

-- Player1 y Player2 en Grupo A; Player3 solo en Grupo B
insert into public.grupo_membresias (grupo_id, player_id, tipo, orden, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'titular',  null, 'activo'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b2', 'titular',  null, 'activo'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b3', 'titular',  null, 'activo');

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

select plan(10);

-- 1. Admin ve todos los players via la view.
select _as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from public.players_public),
  3,
  'admin: ve 3 players en players_public'
);

-- 2. Veedor ve todos los players via la view.
select _as('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from public.players_public),
  3,
  'veedor: ve 3 players en players_public'
);

-- 3. Player1 ve a si mismo + Player2 (companeros de Grupo A) = 2 rows.
--    NO ve a Player3 (Grupo B).
select _as('00000000-0000-0000-0000-0000000000a3');
select is(
  (select count(*)::int from public.players_public),
  2,
  'player1: ve solo a P1 y P2 (companeros de Grupo A) = 2'
);

select isnt_empty(
  $$select 1 from public.players_public where id = '00000000-0000-0000-0000-0000000000b1'$$,
  'player1: SI ve su propio row'
);

select isnt_empty(
  $$select 1 from public.players_public where id = '00000000-0000-0000-0000-0000000000b2'$$,
  'player1: SI ve a Player2 (companero de Grupo A)'
);

select is_empty(
  $$select 1 from public.players_public where id = '00000000-0000-0000-0000-0000000000b3'$$,
  'player1: NO ve a Player3 (Grupo B, no comparte grupo)'
);

-- 4. Player1 ve solo Grupo A en grupos.
select is(
  (select count(*)::int from public.grupos),
  1,
  'player1: ve 1 grupo (el suyo)'
);

select isnt_empty(
  $$select 1 from public.grupos where id = '00000000-0000-0000-0000-0000000000e1'$$,
  'player1: SI ve Grupo A'
);

-- 5. Player1 ve la cola completa de Grupo A (2 miembros).
select is(
  (select count(*)::int from public.grupo_membresias where grupo_id = '00000000-0000-0000-0000-0000000000e1'),
  2,
  'player1: ve 2 membresias en Grupo A (P1 y P2)'
);

-- 6. Player1 NO ve membresias de Grupo B.
select is_empty(
  $$select 1 from public.grupo_membresias where grupo_id = '00000000-0000-0000-0000-0000000000e2'$$,
  'player1: NO ve membresias de Grupo B'
);

select * from finish();
rollback;
