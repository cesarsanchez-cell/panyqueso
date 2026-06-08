-- ============================================================================
-- Vista jugador v3: balance_hint neutro en get_my_confirmed_match_teams
-- ============================================================================
--
-- Cubre el enum de balance (sin exponer numeros):
--   1. Grupo con equipos desbalanceados (A fuerte, B flojo) => 'equipo_B_abajo'.
--   2. Grupo con equipos parejos (mismos ratings) => 'parejos'.
--
-- internal_score lo calcula el trigger desde technical/physical/mental + edad,
-- asi que 10/10/10 >> 1/1/1 (desbalance) y 5/5/5 == 5/5/5 (parejo).
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
   'admin-bal@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'p1-bal@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'player', nombre = 'P1'    where id = '00000000-0000-0000-0000-0000000000a2';

-- b1 = caller (fuerte), b2 = flojo; b3/b4 = parejos.
insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, auth_user_id
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'jugador_campo', 'defensor',     10, 10, 10, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000b2', 'P2', 30, 'jugador_campo', 'defensor',      1,  1,  1, 'approved', '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000b3', 'P3', 30, 'jugador_campo', 'mediocampista', 5,  5,  5, 'approved', '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000b4', 'P4', 30, 'jugador_campo', 'delantero',     5,  5,  5, 'approved', '00000000-0000-0000-0000-0000000000a1', null);

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

-- e1 = grupo desbalanceado, e2 = grupo parejo.
insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e2', 'Grupo e2', '00000000-0000-0000-0000-00000000000a', 3, '20:00', 6, '00000000-0000-0000-0000-0000000000a1');

-- El caller (P1) es miembro activo de ambos grupos (asi ve ambos partidos).
insert into public.grupo_membresias (grupo_id, player_id, tipo, orden, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'titular', null, 'activo'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b1', 'titular', null, 'activo');

insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date + 3, '20:00', 6, 'cerrada', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000c2', current_date + 3, '20:00', 6, 'cerrada', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1');

insert into public.matches (id, convocatoria_id, fecha) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', current_date + 3),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c2', current_date + 3);

-- e1: A = P1 (fuerte), B = P2 (flojo) => B viene abajo.
insert into public.match_teams (id, match_id, team_label) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000000f1', 'A'),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-0000000000f1', 'B'),
  ('00000000-0000-0000-0000-0000000a0003', '00000000-0000-0000-0000-0000000000f2', 'A'),
  ('00000000-0000-0000-0000-0000000a0004', '00000000-0000-0000-0000-0000000000f2', 'B');
insert into public.match_team_players (match_team_id, player_id, is_goalkeeper) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000000b1', false),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-0000000000b2', false),
  ('00000000-0000-0000-0000-0000000a0003', '00000000-0000-0000-0000-0000000000b3', false),
  ('00000000-0000-0000-0000-0000000a0004', '00000000-0000-0000-0000-0000000000b4', false);

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select plan(2);

select _as('00000000-0000-0000-0000-0000000000a2');

-- 1. Grupo desbalanceado (A fuerte, B flojo) => 'equipo_B_abajo'.
select is(
  (select distinct balance_hint from public.get_my_confirmed_match_teams()
    where grupo_id = '00000000-0000-0000-0000-0000000000e1'),
  'equipo_B_abajo',
  'equipos desbalanceados: el equipo mas flojo (B) viene marcado abajo'
);

-- 2. Grupo parejo (mismos ratings) => 'parejos'.
select is(
  (select distinct balance_hint from public.get_my_confirmed_match_teams()
    where grupo_id = '00000000-0000-0000-0000-0000000000e2'),
  'parejos',
  'equipos con el mismo rating: el indicador es parejos'
);

select * from finish();
rollback;
