-- ============================================================================
-- FUT-107c: tests del rescopeo del conteo de votos (figura + premios)
-- ============================================================================
-- El coordinador ve el conteo de votos SOLO de los partidos de su grupo:
--   1-3. get_figura_votes: admin ve el de cualquier grupo; coordinador ve el de
--        su grupo y NO el de otro.
--   4-6. get_award_votes (carnicero): idem.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

select plan(6);

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'admin-rf@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'coord-rf@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

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

insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date, '20:00', 10, 'abierta',
   '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000c2', current_date, '21:00', 10, 'abierta',
   '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1');

-- m1 (grupo e1), m2 (grupo e2).
insert into public.matches (id, convocatoria_id, fecha) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', current_date),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c2', current_date);

-- Votos de figura: en cada partido, b2 recibe 1 voto -> 1 fila en el conteo.
insert into public.match_figura_votes (match_id, voter_player_id, voted_player_id) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2');

-- Votos de premio (carnicero): idem.
insert into public.match_award_votes (match_id, categoria, voter_player_id, voted_player_id) values
  ('00000000-0000-0000-0000-0000000000d1', 'carnicero', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000d2', 'carnicero', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2');

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

-- 1. admin ve el conteo de figura de cualquier grupo (m2).
select _as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from public.get_figura_votes('00000000-0000-0000-0000-0000000000d2')),
  1,
  'admin ve el conteo de figura de cualquier partido'
);

-- 2-3. coordinador ve el de su grupo (m1), no el de otro (m2).
select _as('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from public.get_figura_votes('00000000-0000-0000-0000-0000000000d1')),
  1,
  'coordinador ve el conteo de figura de su grupo'
);
select is(
  (select count(*)::int from public.get_figura_votes('00000000-0000-0000-0000-0000000000d2')),
  0,
  'coordinador NO ve el conteo de figura de otro grupo'
);

-- 4. admin ve el conteo de premio de cualquier grupo (m2).
select _as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from public.get_award_votes('00000000-0000-0000-0000-0000000000d2', 'carnicero')),
  1,
  'admin ve el conteo de premio de cualquier partido'
);

-- 5-6. coordinador ve el de su grupo (m1), no el de otro (m2).
select _as('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from public.get_award_votes('00000000-0000-0000-0000-0000000000d1', 'carnicero')),
  1,
  'coordinador ve el conteo de premio de su grupo'
);
select is(
  (select count(*)::int from public.get_award_votes('00000000-0000-0000-0000-0000000000d2', 'carnicero')),
  0,
  'coordinador NO ve el conteo de premio de otro grupo'
);

select * from finish();
rollback;
