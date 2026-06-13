-- ============================================================================
-- FUT-116: get_grupo_fechas / get_grupo_fecha_stats — visibles para el grupo
-- ============================================================================
--   1. P2 (miembro del grupo que NO jugó la fecha) ve la fecha jugada.
--   2. P2 ve el detalle (jugadores) de esa fecha.
--   3. P3 (NO miembro del grupo) no ve ninguna fecha.
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
   'admin-gf@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'p1-gf@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000000',
   'p2-gf@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-000000000000',
   'p3-gf@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'player', nombre = 'P1'    where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set role = 'player', nombre = 'P2'    where id = '00000000-0000-0000-0000-0000000000a3';
update public.profiles set role = 'player', nombre = 'P3'    where id = '00000000-0000-0000-0000-0000000000a4';

insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, auth_user_id
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'jugador_campo', 'delantero', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000b2', 'P2', 28, 'jugador_campo', 'defensor',  5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000000b3', 'P3', 26, 'jugador_campo', 'mediocampista', 5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a4');

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6, '00000000-0000-0000-0000-0000000000a1');

-- P1 y P2 son miembros activos. P3 NO es miembro. Solo P1 jugó el partido.
insert into public.grupo_membresias (grupo_id, player_id, tipo, orden, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'titular', null, 'activo'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b2', 'titular', null, 'activo');

insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date - 7, '20:00', 6, 'jugada', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1');

insert into public.matches (id, convocatoria_id, fecha, score_team_a, score_team_b, winner) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', current_date - 7, 3, 1, 'a');

insert into public.match_teams (id, match_id, team_label) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000000f1', 'A');
insert into public.match_team_players (match_team_id, player_id, is_goalkeeper) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000000b1', false);

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

select plan(3);

-- 1. P2 (miembro que NO jugó) ve la fecha jugada del grupo.
select _as('00000000-0000-0000-0000-0000000000a3');
select is(
  (select count(*)::int from public.get_grupo_fechas('00000000-0000-0000-0000-0000000000e1'::uuid)),
  1,
  'un miembro del grupo que no jugó igual ve la fecha jugada'
);

-- 2. P2 ve el detalle (P1 jugó en A con 2 goles).
select is(
  (select goles from public.get_grupo_fecha_stats('00000000-0000-0000-0000-0000000000f1'::uuid)
    where player_id = '00000000-0000-0000-0000-0000000000b1'),
  2,
  'el detalle de la fecha muestra los goles de quien jugó'
);

-- 3. P3 (NO miembro del grupo) no ve ninguna fecha.
select _as('00000000-0000-0000-0000-0000000000a4');
select is(
  (select count(*)::int from public.get_grupo_fechas('00000000-0000-0000-0000-0000000000e1'::uuid)),
  0,
  'un jugador que no es miembro del grupo no ve las fechas'
);

select * from finish();
rollback;
