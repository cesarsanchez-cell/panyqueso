-- ============================================================================
-- Fase 10: tests de get_my_match_history (historial del jugador)
-- ============================================================================
--
-- Cubre:
--   1. Solo partidos PASADOS (el futuro no aparece).
--   2. resultado = 'ganado' cuando el equipo del jugador gano + goles cargados.
--   3. resultado = 'perdido' cuando perdio + goles 0 si no hay stats.
--   4. Un player sin partidos no ve nada.
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
   'admin-hist@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'p1-hist@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000000',
   'p2-hist@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'player', nombre = 'P1'    where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set role = 'player', nombre = 'P2'    where id = '00000000-0000-0000-0000-0000000000a3';

insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, auth_user_id
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'jugador_campo', 'delantero', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000b2', 'P2', 28, 'jugador_campo', 'defensor',  5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3');

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6, '00000000-0000-0000-0000-0000000000a1');

-- Convocatorias: 2 pasadas + 1 futura.
insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date - 7,  '20:00', 6, 'jugada',  '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000c2', current_date - 14, '20:00', 6, 'jugada',  '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000c3', current_date + 3,  '20:00', 6, 'cerrada', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1');

-- f1 pasado: P1 en A, gano A (3-1). f2 pasado: P1 en B, gano A (2-0) => P1 perdio.
-- f3 futuro: P1 en A (no debe aparecer).
insert into public.matches (id, convocatoria_id, fecha, score_team_a, score_team_b, winner) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', current_date - 7,  3, 1, 'a'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c2', current_date - 14, 2, 0, 'a'),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000c3', current_date + 3,  null, null, null);

insert into public.match_teams (id, match_id, team_label) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000000f1', 'A'),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-0000000000f2', 'B'),
  ('00000000-0000-0000-0000-0000000a0003', '00000000-0000-0000-0000-0000000000f3', 'A');
insert into public.match_team_players (match_team_id, player_id, is_goalkeeper) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000000b1', false),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-0000000000b1', false),
  ('00000000-0000-0000-0000-0000000a0003', '00000000-0000-0000-0000-0000000000b1', false);

-- Goles de P1 en f1.
insert into public.match_player_stats (match_id, player_id, goals) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b1', 2);

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

select _as('00000000-0000-0000-0000-0000000000a2');

-- 1. Solo los 2 partidos pasados (el futuro f3 no aparece).
select is(
  (select count(*)::int from public.get_my_match_history()),
  2,
  'historial: solo los partidos pasados'
);

-- 2. f1: ganado.
select is(
  (select resultado from public.get_my_match_history() where match_id = '00000000-0000-0000-0000-0000000000f1'),
  'ganado',
  'f1 (equipo A, gano A): resultado ganado'
);

-- 3. f1: goles cargados = 2.
select is(
  (select goles from public.get_my_match_history() where match_id = '00000000-0000-0000-0000-0000000000f1'),
  2,
  'f1: goles del jugador = 2'
);

-- 4. f2: perdido + goles 0 (sin stats).
select is(
  (select resultado || ':' || goles::text from public.get_my_match_history()
    where match_id = '00000000-0000-0000-0000-0000000000f2'),
  'perdido:0',
  'f2 (equipo B, gano A): perdido y goles 0'
);

-- 5. P2 (sin partidos) no ve nada.
select _as('00000000-0000-0000-0000-0000000000a3');
select is(
  (select count(*)::int from public.get_my_match_history()),
  0,
  'player sin partidos: historial vacio'
);

select * from finish();
rollback;
