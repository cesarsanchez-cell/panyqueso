-- ============================================================================
-- FUT-99: tests de la figura votada (match_figura_votes + RPCs)
-- ============================================================================
-- Cubre:
--   1. Un jugador que jugo puede votar; el mas votado resuelve la figura.
--   2. Un jugador que NO jugo no puede votar (voter_not_in_match).
--   3. Empate => figura sin resolver (null).
--   4. Override del admin (matches.figura_player_id) gana sobre el voto.
--   5. get_figura_votes: lo ve el admin, no el jugador.
--   6. Ventana cerrada => no se puede votar (voting_closed).
--   7. get_my_match_history refleja la figura resuelta (figura_es_mia).
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
   'admin-fig@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'p1-fig@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000000',
   'p2-fig@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-000000000000',
   'p3-fig@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-000000000000',
   'p4-fig@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'player', nombre = 'P1'    where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set role = 'player', nombre = 'P2'    where id = '00000000-0000-0000-0000-0000000000a3';
update public.profiles set role = 'player', nombre = 'P3'    where id = '00000000-0000-0000-0000-0000000000a4';
update public.profiles set role = 'player', nombre = 'P4'    where id = '00000000-0000-0000-0000-0000000000a5';

insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, auth_user_id
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'jugador_campo', 'delantero',    6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000b2', 'P2', 28, 'jugador_campo', 'defensor',     5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000000b3', 'P3', 26, 'jugador_campo', 'mediocampista',5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a4'),
  ('00000000-0000-0000-0000-0000000000b4', 'P4', 24, 'jugador_campo', 'delantero',    5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a5');

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6, '00000000-0000-0000-0000-0000000000a1');

-- c1 = el partido jugado (la votacion abre). c2 = la proxima conv, su cierre_at
-- (futuro) es el limite de la votacion -> ventana ABIERTA.
insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, cierre_at, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date - 7, '20:00', 6, 'jugada',  '00000000-0000-0000-0000-0000000000e1', null,                  '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000c2', current_date + 3, '20:00', 6, 'abierta', '00000000-0000-0000-0000-0000000000e1', now() + interval '1 day', '00000000-0000-0000-0000-0000000000a1');

insert into public.matches (id, convocatoria_id, fecha, score_team_a, score_team_b, winner) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', current_date - 7, 3, 1, 'a');

insert into public.match_teams (id, match_id, team_label) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000000f1', 'A');

-- b1, b2, b3 jugaron. b4 NO jugo.
insert into public.match_team_players (match_team_id, player_id, is_goalkeeper) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000000b1', false),
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000000b2', false),
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000000b3', false);

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select plan(10);

-- 1. b1 (jugo) vota a b2.
select _as('00000000-0000-0000-0000-0000000000a2');
select lives_ok(
  $$ select public.cast_figura_vote('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b2') $$,
  'b1 (jugo) puede votar a b2'
);

-- 2. con 1 voto, la figura resuelta = b2 (mas votado, sin override).
select is(
  public.match_figura_resolved('00000000-0000-0000-0000-0000000000f1'),
  '00000000-0000-0000-0000-0000000000b2'::uuid,
  'figura resuelta = el mas votado (b2)'
);

-- 3. b4 (NO jugo) no puede votar.
select _as('00000000-0000-0000-0000-0000000000a5');
select throws_ok(
  $$ select public.cast_figura_vote('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b1') $$,
  'P0001',
  'voter_not_in_match',
  'b4 (no jugo) no puede votar'
);

-- 4. b2 vota a b3 => empate 1-1 (b2 y b3).
select _as('00000000-0000-0000-0000-0000000000a3');
select lives_ok(
  $$ select public.cast_figura_vote('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b3') $$,
  'b2 vota a b3'
);

-- 5. empate => figura sin resolver (null).
select is(
  public.match_figura_resolved('00000000-0000-0000-0000-0000000000f1'),
  null,
  'empate => figura vacante (null)'
);

-- 6. override del admin gana sobre el voto.
select set_config('role', 'postgres', true);
update public.matches set figura_player_id = '00000000-0000-0000-0000-0000000000b1'
 where id = '00000000-0000-0000-0000-0000000000f1';
select is(
  public.match_figura_resolved('00000000-0000-0000-0000-0000000000f1'),
  '00000000-0000-0000-0000-0000000000b1'::uuid,
  'override del admin gana sobre el mas votado'
);

-- 7. get_figura_votes: el admin ve el conteo (2 jugadores votados).
select _as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from public.get_figura_votes('00000000-0000-0000-0000-0000000000f1')),
  2,
  'admin ve el conteo de votos (b2 y b3)'
);

-- 8. get_figura_votes: un jugador NO ve el conteo (vacio).
select _as('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from public.get_figura_votes('00000000-0000-0000-0000-0000000000f1')),
  0,
  'el jugador no ve el conteo de votos'
);

-- 9. ventana cerrada (cierre_at de la proxima conv ya paso) => no se puede votar.
select set_config('role', 'postgres', true);
update public.convocatorias set cierre_at = now() - interval '1 day'
 where id = '00000000-0000-0000-0000-0000000000c2';
select _as('00000000-0000-0000-0000-0000000000a4');
select throws_ok(
  $$ select public.cast_figura_vote('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b2') $$,
  'P0001',
  'voting_closed',
  'con la ventana cerrada no se puede votar'
);

-- 10. get_my_match_history: para b1 la figura resuelta (override = b1) es suya.
select _as('00000000-0000-0000-0000-0000000000a2');
select is(
  (select figura_es_mia from public.get_my_match_history()
    where match_id = '00000000-0000-0000-0000-0000000000f1'),
  true,
  'historial: figura_es_mia true cuando la figura resuelta soy yo'
);

select * from finish();
rollback;
