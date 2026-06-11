-- ============================================================================
-- FUT-107a: tests del rescopeo de convocatorias / convocatoria_players
-- ============================================================================
-- Cubre que el coordinador opere SOLO su grupo:
--   1-2. Lectura de convocatorias: admin ve todas, coordinador solo su grupo.
--   3-4. El coordinador ve su convocatoria pero NO la de otro grupo.
--   5-6. El coordinador puede crear convocatoria en su grupo, NO en otro (RLS).
--   7-8. El roster (convocatoria_players): ve el de su grupo, NO el de otro.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

select plan(8);

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'admin-rc@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'coord-rc@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000000',
   'player-rc@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',       nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'coordinador', nombre = 'Coord' where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set role = 'player',      nombre = 'P1'    where id = '00000000-0000-0000-0000-0000000000a3';

insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved',
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

-- c1 en e1, c2 en e2.
insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date, '20:00', 10, 'abierta',
   '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000c2', current_date, '21:00', 10, 'abierta',
   '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1');

-- Un convocado en cada una.
insert into public.convocatoria_players (convocatoria_id, player_id, attendance_status, rol_en_convocatoria) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'confirmado', 'titular'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', 'confirmado', 'titular');

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

-- 1. admin ve las dos convocatorias.
select _as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from public.convocatorias),
  2,
  'admin ve todas las convocatorias'
);

-- 2-4. coordinador ve solo la de su grupo.
select _as('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from public.convocatorias),
  1,
  'coordinador ve solo las convocatorias de su grupo'
);
select is(
  (select count(*)::int from public.convocatorias where id = '00000000-0000-0000-0000-0000000000c1'),
  1,
  'coordinador ve la convocatoria de su grupo'
);
select is(
  (select count(*)::int from public.convocatorias where id = '00000000-0000-0000-0000-0000000000c2'),
  0,
  'coordinador NO ve la convocatoria de otro grupo'
);

-- 5. coordinador puede crear convocatoria en su grupo.
select lives_ok(
  $$ insert into public.convocatorias (fecha, hora, cupo_maximo, status, grupo_id, created_by)
     values (current_date + 7, '20:00', 10, 'abierta',
       '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a2') $$,
  'coordinador crea convocatoria en su grupo'
);

-- 6. coordinador NO puede crear convocatoria en otro grupo (RLS).
select throws_ok(
  $$ insert into public.convocatorias (fecha, hora, cupo_maximo, status, grupo_id, created_by)
     values (current_date + 7, '21:00', 10, 'abierta',
       '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a2') $$,
  '42501',
  NULL,
  'coordinador NO puede crear convocatoria en un grupo ajeno'
);

-- 7-8. roster: ve el de su grupo, no el de otro.
select is(
  (select count(*)::int from public.convocatoria_players
    where convocatoria_id = '00000000-0000-0000-0000-0000000000c1'),
  1,
  'coordinador ve el roster de su grupo'
);
select is(
  (select count(*)::int from public.convocatoria_players
    where convocatoria_id = '00000000-0000-0000-0000-0000000000c2'),
  0,
  'coordinador NO ve el roster de otro grupo'
);

select * from finish();
rollback;
