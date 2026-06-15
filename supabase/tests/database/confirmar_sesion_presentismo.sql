-- ============================================================================
-- FUT-116 (Fase 12 / A4): confirmar_sesion_presentismo crea el partido
-- ============================================================================
--   1.  confirmar crea un match para la convocatoria.
--   2.  ...con winner NULL (sin resultado).
--   3.  crea match_teams A y B (2 equipos).
--   4.  todos los presentes del armado quedan como participantes (4).
--   5.  el arquero queda is_goalkeeper = true.
--   6.  la convocatoria queda 'cerrada'.
--   7.  confirmar de nuevo → ya_confirmada (P0083).
--   8.  confirmar una sesión sin armado → sin_armado (P0082).
--   9.  un armado de 3 equipos crea el match_teams con label 'C'.
--   10. ...y suma a los 6 participantes.
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
   'admin-conf@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin', nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id, status, modo_confirmacion) values
  ('00000000-0000-0000-0000-0000000000e1', 'Pres', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 12,
   '00000000-0000-0000-0000-0000000000a1', 'activo', 'presentismo');

insert into public.players (id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by) values
  ('00000000-0000-0000-0000-0000000000f1', 'J1', 30, 'arquero', 'arquero', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000f2', 'J2', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000f3', 'J3', 30, 'arquero', 'arquero', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000f4', 'J4', 30, 'jugador_campo', 'defensor', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000f5', 'J5', 30, 'arquero', 'arquero', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000f6', 'J6', 30, 'jugador_campo', 'delantero', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1');

create or replace function _as(p_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select plan(10);

select _as('00000000-0000-0000-0000-0000000000a1');

-- ---- Sesión 1: armado de 2 equipos -----------------------------------------
create temporary table _c1 on commit drop as
select public.abrir_cancha('00000000-0000-0000-0000-0000000000e1', current_date + 1) as conv_id;

select public.guardar_armado_presentismo(
  (select conv_id from _c1),
  jsonb_build_object(
    'numTeams', 2, 'teamSize', 2, 'armadoAt', 'x',
    'teams', jsonb_build_array(
      jsonb_build_object('label','A',
        'goalkeeper', jsonb_build_object('id','00000000-0000-0000-0000-0000000000f1','nombre','J1'),
        'players', jsonb_build_array(jsonb_build_object('id','00000000-0000-0000-0000-0000000000f2','nombre','J2')),
        'bench', '[]'::jsonb),
      jsonb_build_object('label','B',
        'goalkeeper', jsonb_build_object('id','00000000-0000-0000-0000-0000000000f3','nombre','J3'),
        'players', jsonb_build_array(jsonb_build_object('id','00000000-0000-0000-0000-0000000000f4','nombre','J4')),
        'bench', '[]'::jsonb)
    )
  )
);

create temporary table _m1 on commit drop as
select public.confirmar_sesion_presentismo((select conv_id from _c1)) as match_id;

-- 1. Hay match para la conv.
select is(
  (select count(*)::int from public.matches where convocatoria_id = (select conv_id from _c1)),
  1, 'confirmar crea un match para la convocatoria');

-- 2. winner NULL.
select ok(
  (select winner is null from public.matches where id = (select match_id from _m1)),
  'el match queda con winner NULL (sin resultado)');

-- 3. match_teams A y B.
select is(
  (select array_agg(team_label::text order by team_label) from public.match_teams where match_id = (select match_id from _m1)),
  array['A','B'], 'crea match_teams A y B');

-- 4. 4 participantes.
select is(
  (select count(*)::int from public.match_team_players mtp
     join public.match_teams mt on mt.id = mtp.match_team_id
    where mt.match_id = (select match_id from _m1)),
  4, 'todos los presentes del armado quedan como participantes');

-- 5. arquero marcado.
select is(
  (select count(*)::int from public.match_team_players mtp
     join public.match_teams mt on mt.id = mtp.match_team_id
    where mt.match_id = (select match_id from _m1)
      and mtp.player_id = '00000000-0000-0000-0000-0000000000f1'
      and mtp.is_goalkeeper),
  1, 'el arquero queda is_goalkeeper = true');

-- 6. conv cerrada.
select is(
  (select status::text from public.convocatorias where id = (select conv_id from _c1)),
  'cerrada', 'la convocatoria queda cerrada tras confirmar');

-- 7. doble confirmación.
select throws_ok(
  $$ select public.confirmar_sesion_presentismo((select conv_id from _c1)) $$,
  'P0083', null, 'confirmar de nuevo falla (ya_confirmada)');

-- ---- Sesión 2: sin armado --------------------------------------------------
create temporary table _c2 on commit drop as
select public.abrir_cancha('00000000-0000-0000-0000-0000000000e1', current_date + 2) as conv_id;

select throws_ok(
  $$ select public.confirmar_sesion_presentismo((select conv_id from _c2)) $$,
  'P0082', null, 'confirmar sin armado falla (sin_armado)');

-- ---- Sesión 3: armado de 3 equipos (label C) -------------------------------
create temporary table _c3 on commit drop as
select public.abrir_cancha('00000000-0000-0000-0000-0000000000e1', current_date + 3) as conv_id;

select public.guardar_armado_presentismo(
  (select conv_id from _c3),
  jsonb_build_object(
    'numTeams', 3, 'teamSize', 2, 'armadoAt', 'x',
    'teams', jsonb_build_array(
      jsonb_build_object('label','A','goalkeeper', null,
        'players', jsonb_build_array(jsonb_build_object('id','00000000-0000-0000-0000-0000000000f1','nombre','J1'),
                                     jsonb_build_object('id','00000000-0000-0000-0000-0000000000f2','nombre','J2')),
        'bench', '[]'::jsonb),
      jsonb_build_object('label','B','goalkeeper', null,
        'players', jsonb_build_array(jsonb_build_object('id','00000000-0000-0000-0000-0000000000f3','nombre','J3'),
                                     jsonb_build_object('id','00000000-0000-0000-0000-0000000000f4','nombre','J4')),
        'bench', '[]'::jsonb),
      jsonb_build_object('label','C','goalkeeper', null,
        'players', jsonb_build_array(jsonb_build_object('id','00000000-0000-0000-0000-0000000000f5','nombre','J5'),
                                     jsonb_build_object('id','00000000-0000-0000-0000-0000000000f6','nombre','J6')),
        'bench', '[]'::jsonb)
    )
  )
);

create temporary table _m3 on commit drop as
select public.confirmar_sesion_presentismo((select conv_id from _c3)) as match_id;

-- 9. tiene el label 'C'.
select ok(
  (select 'C' = any(array_agg(team_label::text)) from public.match_teams where match_id = (select match_id from _m3)),
  'un armado de 3 equipos crea el match_teams con label C');

-- 10. 6 participantes.
select is(
  (select count(*)::int from public.match_team_players mtp
     join public.match_teams mt on mt.id = mtp.match_team_id
    where mt.match_id = (select match_id from _m3)),
  6, 'los 6 presentes quedan como participantes');

select * from finish();
rollback;
