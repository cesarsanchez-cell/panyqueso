-- ============================================================================
-- Fase 9 Bug 4: tests de create_next_convocatoria (worker de auto-renovacion)
-- ============================================================================
--
-- Cubre:
--   1. No-admin -> forbidden (P0001).
--   2. Admin -> crea la conv +7d (abierta) heredando el roster no-declinado.
--   3. El roster heredado mantiene titulares y suplentes.
--   4. Segunda llamada -> null (ya hay abierta posterior), no duplica.
--   5. Grupo con auto_renovar=false -> null, no crea nada.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

-- Setup: admin + 3 players.
insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'admin-cnc@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'p1-cnc@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000000',
   'p2-cnc@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-000000000000',
   'p3-cnc@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'player', nombre = 'P1'    where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set role = 'player', nombre = 'P2'    where id = '00000000-0000-0000-0000-0000000000a3';
update public.profiles set role = 'player', nombre = 'P3'    where id = '00000000-0000-0000-0000-0000000000a4';

insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, auth_user_id
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000b2', 'P2', 28, 'jugador_campo', 'defensor',      5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000000b3', 'P3', 32, 'jugador_campo', 'delantero',     7, 7, 7, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a4');

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

-- Grupo e1 (auto_renovar default true, cupo 2) y e2 (auto_renovar false).
insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 2, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e2', 'Grupo e2', '00000000-0000-0000-0000-00000000000a', 4, '21:00', 2, '00000000-0000-0000-0000-0000000000a1');
update public.grupos set auto_renovar = false where id = '00000000-0000-0000-0000-0000000000e2';

insert into public.grupo_membresias (grupo_id, player_id, tipo, orden, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'titular', null, 'activo'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b2', 'titular', null, 'activo'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b3', 'titular', null, 'activo');

-- Conv origen c1 de e1 (cerrada, como tras confirmar el match).
insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date, '20:00', 2, 'cerrada', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1');

insert into public.convocatoria_players (convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b2', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b3', 'confirmado', 'suplente', 1);

-- Conv origen c2 de e2 (grupo con auto_renovar=false).
insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c2', current_date, '21:00', 2, 'cerrada', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1');

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select plan(6);

-- 1. No-admin (player) -> forbidden (P0001).
select _as('00000000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$select public.create_next_convocatoria('00000000-0000-0000-0000-0000000000c1'::uuid)$$,
  'P0001',
  'no-admin: create_next_convocatoria lanza forbidden (P0001)'
);

-- 2. Admin -> crea la conv +7d abierta para e1.
select _as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$select public.create_next_convocatoria('00000000-0000-0000-0000-0000000000c1'::uuid)$$,
  'admin: create_next_convocatoria corre sin error'
);

select is(
  (select count(*)::int from public.convocatorias
     where grupo_id = '00000000-0000-0000-0000-0000000000e1'
       and status = 'abierta'
       and fecha = current_date + 7),
  1,
  'admin: se creo la conv +7d abierta para e1'
);

-- 3. El roster heredado mantiene 2 titulares + 1 suplente.
select is(
  (select count(*)::int
     from public.convocatoria_players cp
     join public.convocatorias c on c.id = cp.convocatoria_id
    where c.grupo_id = '00000000-0000-0000-0000-0000000000e1'
      and c.status = 'abierta'
      and cp.rol_en_convocatoria = 'suplente'),
  1,
  'roster heredado: 1 suplente en la nueva conv'
);

-- 4. Segunda llamada -> null (ya hay abierta posterior), no duplica.
select is(
  (select public.create_next_convocatoria('00000000-0000-0000-0000-0000000000c1'::uuid)),
  null,
  'segunda llamada: devuelve null (no duplica)'
);

-- 5. Grupo con auto_renovar=false -> null.
select is(
  (select public.create_next_convocatoria('00000000-0000-0000-0000-0000000000c2'::uuid)),
  null,
  'auto_renovar=false: devuelve null'
);

select * from finish();
rollback;
