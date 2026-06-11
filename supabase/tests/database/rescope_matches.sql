-- ============================================================================
-- FUT-107b: tests del rescopeo de matches y tablas del partido
-- ============================================================================
-- Cubre que el coordinador opere SOLO el partido de su grupo:
--   1.    admin ve los dos partidos.
--   2-4.  coordinador ve solo el partido de su grupo (via convocatoria).
--   5-6.  puede crear partido en convocatoria de su grupo, NO en otro (RLS).
--   7.    match_teams: ve los de su partido, no los del otro.
--   8.    match_team_players: ve los de su partido, no los del otro.
--   9-10. match_player_stats: puede cargar en su partido, NO en otro (RLS).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

select plan(10);

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'admin-rm@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'coord-rm@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

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

-- c1/c3 en e1, c2/c4 en e2. c3/c4 quedan SIN partido (para test de insert).
insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date,     '20:00', 10, 'abierta',
   '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000c2', current_date,     '21:00', 10, 'abierta',
   '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000c3', current_date + 7, '20:00', 10, 'abierta',
   '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000c4', current_date + 7, '21:00', 10, 'abierta',
   '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1');

-- m1 (c1, grupo e1), m2 (c2, grupo e2).
insert into public.matches (id, convocatoria_id, fecha) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', current_date),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c2', current_date);

-- Dos equipos por partido.
insert into public.match_teams (id, match_id, team_label) values
  ('00000000-0000-0000-0000-0000000f1a', '00000000-0000-0000-0000-0000000000d1', 'A'),
  ('00000000-0000-0000-0000-0000000f1b', '00000000-0000-0000-0000-0000000000d1', 'B'),
  ('00000000-0000-0000-0000-0000000f2a', '00000000-0000-0000-0000-0000000000d2', 'A'),
  ('00000000-0000-0000-0000-0000000f2b', '00000000-0000-0000-0000-0000000000d2', 'B');

-- Un jugador en cada partido.
insert into public.match_team_players (match_team_id, player_id) values
  ('00000000-0000-0000-0000-0000000f1a', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000f2a', '00000000-0000-0000-0000-0000000000b1');

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

-- 1. admin ve los dos partidos.
select _as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from public.matches),
  2,
  'admin ve todos los partidos'
);

-- 2-4. coordinador ve solo el de su grupo.
select _as('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from public.matches),
  1,
  'coordinador ve solo los partidos de su grupo'
);
select is(
  (select count(*)::int from public.matches where id = '00000000-0000-0000-0000-0000000000d1'),
  1,
  'coordinador ve el partido de su grupo'
);
select is(
  (select count(*)::int from public.matches where id = '00000000-0000-0000-0000-0000000000d2'),
  0,
  'coordinador NO ve el partido de otro grupo'
);

-- 5. coordinador puede crear partido en convocatoria de su grupo.
select lives_ok(
  $$ insert into public.matches (convocatoria_id, fecha)
     values ('00000000-0000-0000-0000-0000000000c3', current_date + 7) $$,
  'coordinador crea partido en convocatoria de su grupo'
);

-- 6. coordinador NO puede crear partido en convocatoria de otro grupo (RLS).
select throws_ok(
  $$ insert into public.matches (convocatoria_id, fecha)
     values ('00000000-0000-0000-0000-0000000000c4', current_date + 7) $$,
  '42501',
  NULL,
  'coordinador NO puede crear partido en un grupo ajeno'
);

-- 7. match_teams: ve los 2 equipos de su partido, no los del otro.
select is(
  (select count(*)::int from public.match_teams),
  2,
  'coordinador ve solo los equipos de su partido'
);

-- 8. match_team_players: ve el de su partido, no el del otro.
select is(
  (select count(*)::int from public.match_team_players),
  1,
  'coordinador ve solo los jugadores asignados de su partido'
);

-- 9. coordinador NO puede cargar stats en un partido ajeno (RLS).
select throws_ok(
  $$ insert into public.match_player_stats (match_id, player_id, goals)
     values ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b2', 1) $$,
  '42501',
  NULL,
  'coordinador NO puede cargar stats en un partido ajeno'
);

-- 10. coordinador puede cargar stats en su partido.
select lives_ok(
  $$ insert into public.match_player_stats (match_id, player_id, goals)
     values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b2', 2) $$,
  'coordinador carga stats en su partido'
);

select * from finish();
rollback;
