-- ============================================================================
-- FUT-99: tests de la figura votada (ventana 48h + revelar al cerrar)
-- ============================================================================
-- Cubre:
--   1. Un jugador que jugo puede votar (ventana abierta).
--   2. Mientras la votacion esta ABIERTA la figura NO se revela (null).
--   3. Un jugador que NO jugo no puede votar.
--   4. Conteo de votos: lo ve el admin, no el jugador.
--   5. Al CERRAR la votacion se revela el mas votado (lider unico).
--   6. Con la ventana cerrada no se puede votar.
--   7. Override del admin gana (y se muestra) sobre el voto.
--   8. Empate => figura vacante (null) aun cerrada.
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

-- c1: el partido. fecha = ayer 20:00 => ventana ABIERTA (abre ayer 20:00, cierra
-- manana 20:00). Para cerrarla, mas adelante movemos fecha 3 dias atras.
insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date - 1, '20:00', 6, 'jugada', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1');

insert into public.matches (id, convocatoria_id, fecha, score_team_a, score_team_b, winner) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', current_date - 1, 3, 1, 'a');

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

select plan(11);

-- 1. (abierta) b1 vota a b2.
select _as('00000000-0000-0000-0000-0000000000a2');
select lives_ok(
  $$ select public.cast_figura_vote('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b2') $$,
  'b1 (jugo) puede votar con la ventana abierta'
);

-- 2. mientras esta ABIERTA, la figura NO se revela (sin override => null).
select is(
  public.match_figura_resolved('00000000-0000-0000-0000-0000000000f1'),
  null,
  'votacion abierta => figura no revelada (null)'
);

-- 3. b4 (NO jugo) no puede votar.
select _as('00000000-0000-0000-0000-0000000000a5');
select throws_ok(
  $$ select public.cast_figura_vote('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b1') $$,
  'P0001',
  'voter_not_in_match',
  'b4 (no jugo) no puede votar'
);

-- 4-5. b2 vota a b3 y b3 vota a b2 => b2:2 (b1,b3), b3:1 (b2). Lider unico = b2.
select _as('00000000-0000-0000-0000-0000000000a3');
select lives_ok(
  $$ select public.cast_figura_vote('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b3') $$,
  'b2 vota a b3'
);
select _as('00000000-0000-0000-0000-0000000000a4');
select lives_ok(
  $$ select public.cast_figura_vote('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b2') $$,
  'b3 vota a b2'
);

-- 6. el admin ve el conteo (2 jugadores votados: b2 y b3).
select _as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from public.get_figura_votes('00000000-0000-0000-0000-0000000000f1')),
  2,
  'admin ve el conteo de votos'
);

-- 7. un jugador NO ve el conteo (vacio).
select _as('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from public.get_figura_votes('00000000-0000-0000-0000-0000000000f1')),
  0,
  'el jugador no ve el conteo de votos'
);

-- 8. CERRAMOS la votacion (fecha 3 dias atras => paso el cierre de 48h) y se
--    revela el mas votado (b2).
select set_config('role', 'postgres', true);
update public.convocatorias set fecha = current_date - 3
 where id = '00000000-0000-0000-0000-0000000000c1';
select is(
  public.match_figura_resolved('00000000-0000-0000-0000-0000000000f1'),
  '00000000-0000-0000-0000-0000000000b2'::uuid,
  'al cerrar => se revela el mas votado (b2)'
);

-- 9. con la ventana cerrada no se puede votar.
select _as('00000000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$ select public.cast_figura_vote('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b3') $$,
  'P0001',
  'voting_closed',
  'con la ventana cerrada no se puede votar'
);

-- 10. override del admin gana (y se muestra) sobre el mas votado.
select set_config('role', 'postgres', true);
update public.matches set figura_player_id = '00000000-0000-0000-0000-0000000000b3'
 where id = '00000000-0000-0000-0000-0000000000f1';
select is(
  public.match_figura_resolved('00000000-0000-0000-0000-0000000000f1'),
  '00000000-0000-0000-0000-0000000000b3'::uuid,
  'override del admin gana sobre el voto'
);

-- 11. sin override y con empate (b2:1, b3:1) => figura vacante (null) aun cerrada.
select set_config('role', 'postgres', true);
update public.matches set figura_player_id = null
 where id = '00000000-0000-0000-0000-0000000000f1';
delete from public.match_figura_votes
 where match_id = '00000000-0000-0000-0000-0000000000f1'
   and voter_player_id = '00000000-0000-0000-0000-0000000000b3';
select is(
  public.match_figura_resolved('00000000-0000-0000-0000-0000000000f1'),
  null,
  'empate sin override => figura vacante (null)'
);

select * from finish();
rollback;
