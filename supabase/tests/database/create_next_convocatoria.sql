-- ============================================================================
-- Fase 9 Bug 4: tests de create_next_convocatoria (worker de auto-renovacion)
-- ============================================================================
--
-- Cubre:
--   1. Player -> forbidden (P0001).
--   2. Coordinador de OTRO grupo -> forbidden (P0001).
--   3. Admin -> crea la conv +7d (abierta) heredando el roster no-declinado.
--   4. El roster heredado excluye al declinado (Bug 2) y mantiene suplentes.
--   5. Segunda llamada -> null (ya hay abierta posterior), no duplica.
--   6. Coordinador asignado a SU grupo -> crea la conv +7d (fix Fase 11).
--   7. Grupo con auto_renovar=false -> null, no crea nada.
--
-- create_next_convocatoria lee grupos + convocatoria_players de la conv origen;
-- NO lee grupo_membresias (por eso este test no las necesita).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

-- Auth users: admin (a1), player (a2) y coordinador (a3) para los tests de
-- permisos. El resto de los players no necesitan auth (auth_user_id nullable).
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
   'coord-cnc@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',       nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'player',      nombre = 'P1'    where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set role = 'coordinador', nombre = 'Coord' where id = '00000000-0000-0000-0000-0000000000a3';

-- 8 players: b1..b6 titulares, b7 suplente, b8 declinado. Solo b1 con auth.
insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, auth_user_id
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000b2', 'P2', 28, 'jugador_campo', 'defensor',      5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000b3', 'P3', 32, 'jugador_campo', 'delantero',     7, 7, 7, 'approved', '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000b4', 'P4', 26, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000b5', 'P5', 29, 'jugador_campo', 'defensor',      6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000b6', 'P6', 31, 'jugador_campo', 'delantero',     6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000b7', 'P7', 27, 'jugador_campo', 'mediocampista', 5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000b8', 'P8', 33, 'jugador_campo', 'defensor',      5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1', null);

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

-- Grupo e1 (cupo 6, auto_renovar default true), e2 (auto_renovar false) y e3
-- (grupo del coordinador a3, para el fix Fase 11).
insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e2', 'Grupo e2', '00000000-0000-0000-0000-00000000000a', 4, '21:00', 6, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e3', 'Grupo e3', '00000000-0000-0000-0000-00000000000a', 6, '22:00', 6, '00000000-0000-0000-0000-0000000000a1');
update public.grupos set auto_renovar = false where id = '00000000-0000-0000-0000-0000000000e2';
-- Fase 10: la fecha de la siguiente snapea al dia del grupo. Alineamos
-- dia_semana de e1 y e3 con el dia de HOY para que, con la conv origen en
-- current_date, la siguiente caiga deterministicamente en current_date + 7
-- (independiente del dia en que corra el CI). El snap fuera de ciclo se cubre
-- en create_next_convocatoria_snap.sql.
update public.grupos set dia_semana = extract(dow from current_date)::int
 where id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e3');

-- a3 es coordinador SOLO de e3 (no de e1/e2).
insert into public.coordinador_grupos (profile_id, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000a1');

-- Conv origen c1 de e1 (cerrada, como tras confirmar el match): 6 titulares,
-- 1 suplente, 1 declinado.
insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date, '20:00', 6, 'cerrada', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1');

insert into public.convocatoria_players (convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b2', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b3', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b4', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b5', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b6', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b7', 'confirmado', 'suplente', 1),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b8', 'declinado',  'suplente', 2);

-- Conv origen c2 de e2 (grupo con auto_renovar=false).
insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c2', current_date, '21:00', 6, 'cerrada', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1');

-- Conv origen c3 de e3 (grupo del coordinador a3): 6 titulares (reusa b1..b6).
insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c3', current_date, '22:00', 6, 'cerrada', '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000a1');

insert into public.convocatoria_players (convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente) values
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1', 'confirmado', 'titular', null),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b2', 'confirmado', 'titular', null),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b3', 'confirmado', 'titular', null),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b4', 'confirmado', 'titular', null),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b5', 'confirmado', 'titular', null),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b6', 'confirmado', 'titular', null);

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select plan(10);

-- 1. Player -> forbidden (P0001).
select _as('00000000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$select public.create_next_convocatoria('00000000-0000-0000-0000-0000000000c1'::uuid)$$,
  'P0001',
  'forbidden',
  'player: create_next_convocatoria lanza forbidden (P0001)'
);

-- 2. Coordinador de OTRO grupo (a3 maneja e3, no e1) -> forbidden. El gate de
-- autoridad corre antes que el chequeo de "abierta posterior", asi que c1 sin
-- posterior igual da forbidden.
select _as('00000000-0000-0000-0000-0000000000a3');
select throws_ok(
  $$select public.create_next_convocatoria('00000000-0000-0000-0000-0000000000c1'::uuid)$$,
  'P0001',
  'forbidden',
  'coordinador ajeno: forbidden sobre un grupo que no gestiona (P0001)'
);

-- 3. Admin -> crea la conv +7d abierta para e1.
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

-- 4. Roster heredado: 7 rows (6 titulares + 1 suplente), el declinado NO se
-- copia (Bug 2) y como hay 6 titulares no se promueve al suplente.
select is(
  (select count(*)::int
     from public.convocatoria_players cp
     join public.convocatorias c on c.id = cp.convocatoria_id
    where c.grupo_id = '00000000-0000-0000-0000-0000000000e1'
      and c.status = 'abierta'),
  7,
  'roster heredado: 7 rows (declinado excluido)'
);

select is(
  (select count(*)::int
     from public.convocatoria_players cp
     join public.convocatorias c on c.id = cp.convocatoria_id
    where c.grupo_id = '00000000-0000-0000-0000-0000000000e1'
      and c.status = 'abierta'
      and cp.rol_en_convocatoria = 'suplente'),
  1,
  'roster heredado: el suplente se mantiene (no promovido)'
);

-- 5. Segunda llamada -> null (ya hay abierta posterior), no duplica.
select is(
  (select public.create_next_convocatoria('00000000-0000-0000-0000-0000000000c1'::uuid)),
  null,
  'segunda llamada: devuelve null (no duplica)'
);

-- 6. Coordinador asignado a SU grupo (a3 -> e3) crea la conv +7d (fix Fase 11).
select _as('00000000-0000-0000-0000-0000000000a3');
select lives_ok(
  $$select public.create_next_convocatoria('00000000-0000-0000-0000-0000000000c3'::uuid)$$,
  'coordinador del grupo: create_next corre sin error'
);
select is(
  (select count(*)::int from public.convocatorias
     where grupo_id = '00000000-0000-0000-0000-0000000000e3'
       and status = 'abierta'
       and fecha = current_date + 7),
  1,
  'coordinador del grupo: se creo la conv +7d abierta para e3'
);

-- 7. Grupo con auto_renovar=false -> null (como admin, que si puede gestionarlo).
select _as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select public.create_next_convocatoria('00000000-0000-0000-0000-0000000000c2'::uuid)),
  null,
  'auto_renovar=false: devuelve null'
);

select * from finish();
rollback;
