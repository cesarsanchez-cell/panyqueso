-- ============================================================================
-- Test: el roster y la convocatoria del grupo se gatean por ficha, no por rol
-- ============================================================================
-- Un coordinador que TAMBIÉN juega (rol 'coordinador', con ficha) y es miembro
-- de un grupo que NO gestiona debe ver, en su vista de jugador, la convocatoria
-- de ese grupo y el ROSTER COMPLETO (todos los anotados), no solo su propia fila.
--   Setup: a2 = coordinador con ficha b2. Coordina e2 (por eso rol coordinador).
--          Es miembro-jugador de e1 (que NO gestiona), junto con otro jugador c3.
--          e1 tiene una convocatoria abierta con b2 y c3 como titulares.
--   1. a2 ve la convocatoria de e1.
--   2. a2 ve el roster COMPLETO (2 filas: b2 y c3), no solo la suya.
--   3. a2 NO ve la convocatoria de e3 (grupo ajeno).
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
   'admin-rf@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'coordjuega-rf@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',       nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'coordinador', nombre = 'CoordJuega' where id = '00000000-0000-0000-0000-0000000000a2';

-- a2 tiene ficha (b2). c3 es otro jugador del mismo grupo e1.
insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, auth_user_id
) values
  ('00000000-0000-0000-0000-0000000000b2', 'Coco', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved',
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000c3', 'Tito', 28, 'jugador_campo', 'defensor', 6, 6, 6, 'approved',
   '00000000-0000-0000-0000-0000000000a1', null);

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e2', 'Grupo e2', '00000000-0000-0000-0000-00000000000a', 4, '21:00', 6, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e3', 'Grupo e3', '00000000-0000-0000-0000-00000000000a', 5, '22:00', 6, '00000000-0000-0000-0000-0000000000a1');

-- a2 coordina e2 (de ahí su rol coordinador), pero NO e1 ni e3.
insert into public.coordinador_grupos (profile_id, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1');

-- b2 (a2) y c3 son miembros-jugadores de e1.
insert into public.grupo_membresias (grupo_id, player_id, tipo, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b2', 'titular', 'activo'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c3', 'titular', 'activo');

-- Convocatoria abierta de e1, con b2 y c3 como titulares.
insert into public.convocatorias (id, grupo_id, fecha, hora, cupo_maximo, status, created_by) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1',
   current_date + 3, '20:00', 6, 'abierta', '00000000-0000-0000-0000-0000000000a1');
-- Convocatoria de un grupo ajeno (e3).
insert into public.convocatorias (id, grupo_id, fecha, hora, cupo_maximo, status, created_by) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000e3',
   current_date + 3, '22:00', 6, 'abierta', '00000000-0000-0000-0000-0000000000a1');

insert into public.convocatoria_players (convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b2', 'confirmado', 'titular', null),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c3', 'confirmado', 'titular', null);

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

select _as('00000000-0000-0000-0000-0000000000a2');

-- 1. ve la convocatoria de e1 (es miembro, aunque su rol sea coordinador).
select is(
  (select count(*)::int from public.convocatorias where id = '00000000-0000-0000-0000-0000000000f1'),
  1, 'el coordinador que juega ve la convocatoria de su grupo');

-- 2. ve el ROSTER COMPLETO de esa convocatoria (b2 + c3), no solo su fila.
select is(
  (select count(*)::int from public.convocatoria_players
    where convocatoria_id = '00000000-0000-0000-0000-0000000000f1'),
  2, 've el roster completo de la convocatoria, no solo su propia fila');

-- 3. NO ve la convocatoria de un grupo ajeno (e3).
select is(
  (select count(*)::int from public.convocatorias where id = '00000000-0000-0000-0000-0000000000f3'),
  0, 'no ve la convocatoria de un grupo donde no es miembro ni lo gestiona');

reset role;

select * from finish();
rollback;
