-- ============================================================================
-- FUT-109 (#2): balance_hint se deriva del rating POR GRUPO (no la base)
-- ============================================================================
-- Equipo A y B con la MISMA base (la base diría 'parejos'), pero el rating por
-- grupo de A es alto -> el hint debe ser 'equipo_B_abajo', probando que usa el
-- rating del grupo. Nunca expone números (solo el enum).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

select plan(1);

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'admin-bh@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000ap', '00000000-0000-0000-0000-000000000000',
   'player-bh@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin'  where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'player' where id = '00000000-0000-0000-0000-0000000000ap';

-- p0 es el que mira (current_player_id). pa/pb juegan en los equipos, con la
-- MISMA base (6/6/6) -> por base, parejos.
insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, auth_user_id
) values
  ('00000000-0000-0000-0000-0000000000p0', 'Viewer', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved',
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000ap'),
  ('00000000-0000-0000-0000-0000000000pa', 'PA', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved',
   '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000pb', 'PB', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved',
   '00000000-0000-0000-0000-0000000000a1', null);

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6,
   '00000000-0000-0000-0000-0000000000a1');

-- Todos miembros activos de e1 (siembra los ratings de grupo desde la base).
insert into public.grupo_membresias (grupo_id, player_id, tipo) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000p0', 'titular'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000pa', 'titular'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000pb', 'titular');

-- Rating por grupo de PA alto (9 subs en 10); PB queda en la base (6).
update public.player_group_ratings
   set phys_power = 10, phys_speed = 10, phys_stamina = 10,
       ment_tactical = 10, ment_resilience = 10, ment_attitude = 10,
       tech_passing = 10, tech_finishing = 10, tech_linkup = 10
 where player_id = '00000000-0000-0000-0000-0000000000pa'
   and grupo_id  = '00000000-0000-0000-0000-0000000000e1';

-- Convocatoria + match confirmado de e1 (fecha hoy).
insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date, '20:00', 10, 'cerrada',
   '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1');

insert into public.matches (id, convocatoria_id, fecha) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', current_date);

insert into public.match_teams (id, match_id, team_label) values
  ('00000000-0000-0000-0000-000000000fa1', '00000000-0000-0000-0000-0000000000d1', 'A'),
  ('00000000-0000-0000-0000-000000000fb1', '00000000-0000-0000-0000-0000000000d1', 'B');

insert into public.match_team_players (match_team_id, player_id) values
  ('00000000-0000-0000-0000-000000000fa1', '00000000-0000-0000-0000-0000000000pa'),
  ('00000000-0000-0000-0000-000000000fb1', '00000000-0000-0000-0000-0000000000pb');

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select _as('00000000-0000-0000-0000-0000000000ap');

select is(
  (select distinct balance_hint from public.get_my_confirmed_match_teams()
    where grupo_id = '00000000-0000-0000-0000-0000000000e1'),
  'equipo_B_abajo',
  'el balance_hint usa el rating por grupo (A alto -> B abajo), no la base (que daría parejos)'
);

select * from finish();
rollback;
