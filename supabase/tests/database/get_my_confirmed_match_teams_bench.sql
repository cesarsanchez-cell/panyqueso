-- ============================================================================
-- Fase 10: tests del banco en get_my_confirmed_match_teams
-- ============================================================================
--
-- Cubre la extension del RPC (suplentes que no entraron como titulares):
--   1. El banco aparece con team_label NULL (suplente no-declinado).
--   2. Equipos siguen con team_label 'A'/'B'.
--   3. Un suplente declinado NO aparece en el banco.
--   4. Conteo total = equipos (2) + banco (1).
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
   'admin-bench@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'p1-bench@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'player', nombre = 'P1'    where id = '00000000-0000-0000-0000-0000000000a2';

insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, auth_user_id
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'arquero',       'arquero',   6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000b2', 'P2', 28, 'jugador_campo', 'defensor',  5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000b3', 'P3', 32, 'jugador_campo', 'delantero', 7, 7, 7, 'approved', '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000b4', 'P4', 26, 'jugador_campo', 'mediocampista', 5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1', null);

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6, '00000000-0000-0000-0000-0000000000a1');

-- P1 miembro activo de e1 (es el caller).
insert into public.grupo_membresias (grupo_id, player_id, tipo, orden, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'titular', null, 'activo');

-- Conv + match FUTURO de e1.
insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date + 3, '20:00', 6, 'cerrada', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1');

insert into public.matches (id, convocatoria_id, fecha) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', current_date + 3);

-- Equipos: P1 (arquero) en A, P2 en B.
insert into public.match_teams (id, match_id, team_label) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000000f1', 'A'),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-0000000000f1', 'B');
insert into public.match_team_players (match_team_id, player_id, is_goalkeeper) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000000b1', true),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-0000000000b2', false);

-- Roster de la convocatoria: P3 suplente activo (banco), P4 suplente declinado.
insert into public.convocatoria_players (
  convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b3', 'confirmado', 'suplente', 1),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b4', 'declinado',  'suplente', 2);

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select plan(4);

select _as('00000000-0000-0000-0000-0000000000a2');

-- 1. El suplente activo P3 aparece con team_label NULL (banco).
select isnt_empty(
  $$select 1 from public.get_my_confirmed_match_teams()
     where player_id = '00000000-0000-0000-0000-0000000000b3'
       and team_label is null$$,
  'el suplente no-declinado aparece en el banco (team_label NULL)'
);

-- 2. Los equipos siguen con team_label A/B.
select is(
  (select count(*)::int from public.get_my_confirmed_match_teams()
    where team_label in ('A', 'B')),
  2,
  'los equipos A/B siguen presentes'
);

-- 3. El suplente declinado P4 NO aparece.
select is_empty(
  $$select 1 from public.get_my_confirmed_match_teams()
     where player_id = '00000000-0000-0000-0000-0000000000b4'$$,
  'el suplente declinado no aparece en el banco'
);

-- 4. Total = equipos (2) + banco (1).
select is(
  (select count(*)::int from public.get_my_confirmed_match_teams()),
  3,
  'total = 2 equipos + 1 banco'
);

select * from finish();
rollback;
