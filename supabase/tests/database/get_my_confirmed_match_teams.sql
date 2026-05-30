-- ============================================================================
-- Fase 9 Bug 7: tests de get_my_confirmed_match_teams (equipos en /mi-perfil)
-- ============================================================================
--
-- Cubre:
--   1. Player del grupo ve los jugadores de ambos equipos del proximo match.
--   2. El arquero viene con is_goalkeeper=true.
--   3. La fecha devuelta es la del match futuro (no el pasado).
--   4. Solo se devuelve el match con fecha >= hoy (el pasado se excluye).
--   5. Un player que NO esta en el grupo no ve nada.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'admin-gct@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'p1-gct@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000000',
   'p2-gct@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-000000000000',
   'p3-gct@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'player', nombre = 'P1'    where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set role = 'player', nombre = 'P2'    where id = '00000000-0000-0000-0000-0000000000a3';
update public.profiles set role = 'player', nombre = 'P3'    where id = '00000000-0000-0000-0000-0000000000a4';

insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, auth_user_id
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'arquero',       'arquero',       6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000b2', 'P2', 28, 'jugador_campo', 'defensor',      5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000000b3', 'P3', 32, 'jugador_campo', 'delantero',     7, 7, 7, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a4');

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

-- Grupo e1: P1 y P2 miembros activos. P3 NO esta en e1.
insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 2, '00000000-0000-0000-0000-0000000000a1');

insert into public.grupo_membresias (grupo_id, player_id, tipo, orden, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'titular', null, 'activo'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b2', 'titular', null, 'activo');

-- Conv + match FUTURO (c1/m1) y conv + match PASADO (c2/m2), ambos de e1.
insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date + 3, '20:00', 2, 'cerrada', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000c2', current_date - 7, '20:00', 2, 'jugada',  '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1');

insert into public.matches (id, convocatoria_id, fecha) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', current_date + 3),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c2', current_date - 7);

-- Equipos del match futuro f1: P1 (arquero) en A, P2 en B.
insert into public.match_teams (id, match_id, team_label) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000000f1', 'A'),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-0000000000f1', 'B');
insert into public.match_team_players (match_team_id, player_id, is_goalkeeper) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000000b1', true),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-0000000000b2', false);

-- Equipos del match pasado f2 (no debe devolverse): P2 en A.
insert into public.match_teams (id, match_id, team_label) values
  ('00000000-0000-0000-0000-0000000a0003', '00000000-0000-0000-0000-0000000000f2', 'A');
insert into public.match_team_players (match_team_id, player_id, is_goalkeeper) values
  ('00000000-0000-0000-0000-0000000a0003', '00000000-0000-0000-0000-0000000000b2', false);

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select plan(5);

-- 1. P1 (miembro de e1) ve 2 jugadores (ambos equipos del match futuro).
select _as('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from public.get_my_confirmed_match_teams()),
  2,
  'player de e1: ve 2 jugadores (match futuro, ambos equipos)'
);

-- 2. P1 viene como arquero (is_goalkeeper=true) en el equipo A.
select isnt_empty(
  $$select 1 from public.get_my_confirmed_match_teams()
     where player_id = '00000000-0000-0000-0000-0000000000b1'
       and team_label = 'A' and is_goalkeeper$$,
  'P1 es arquero del equipo A'
);

-- 3. La fecha devuelta es la del match futuro.
select is(
  (select distinct fecha from public.get_my_confirmed_match_teams()),
  (current_date + 3),
  'la fecha devuelta es la del match futuro'
);

-- 4. El match pasado no aparece (P2 en A del pasado no se cuela como unica fila).
select is_empty(
  $$select 1 from public.get_my_confirmed_match_teams() where fecha < current_date$$,
  'el match pasado (fecha < hoy) se excluye'
);

-- 5. P3 (no esta en e1) no ve nada.
select _as('00000000-0000-0000-0000-0000000000a4');
select is(
  (select count(*)::int from public.get_my_confirmed_match_teams()),
  0,
  'player fuera del grupo: no ve equipos'
);

select * from finish();
rollback;
