-- ============================================================================
-- FUT-114 (Fase 12 / A1): modo presentismo — abrir cancha + check-in + armado
-- ============================================================================
--   1.  abrir_cancha crea una conv modo='presentismo' abierta.
--   2.  ...con cierre_at NULL (el cron la ignora).
--   3.  checkin_miembro suma al miembro al present-list (llegada_at, confirmado).
--   4.  check-in duplicado del mismo miembro → already_checked_in (P0059).
--   5.  checkin_probador crea un registro is_guest = true.
--   6.  ...y el present-list pasa a 2 (miembro + probador).
--   7.  quitar_checkin saca al miembro (present-list vuelve a 1, fila borrada).
--   8.  guardar_armado_presentismo persiste el snapshot.
--   9.  abrir_cancha en un grupo ajeno → not_authorized (P0013).
--   10. checkin_miembro en una conv NO presentismo → P0080.
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
   'admin-pres@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'coord-pres@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',       nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'coordinador', nombre = 'Coord' where id = '00000000-0000-0000-0000-0000000000a2';

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

-- e1: grupo presentismo, coordinado por a2. e2: grupo ajeno (a2 no coordina).
insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id, status, modo_confirmacion) values
  ('00000000-0000-0000-0000-0000000000e1', 'Pres e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 12,
   '00000000-0000-0000-0000-0000000000a1', 'activo', 'presentismo'),
  ('00000000-0000-0000-0000-0000000000e2', 'Pres e2', '00000000-0000-0000-0000-00000000000a', 4, '21:00', 12,
   '00000000-0000-0000-0000-0000000000a1', 'activo', 'presentismo');

insert into public.coordinador_grupos (profile_id, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000a1');

-- Miembros de e1.
insert into public.players (id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by) values
  ('00000000-0000-0000-0000-0000000000f1', 'Jugador 1', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000f2', 'Jugador 2', 30, 'jugador_campo', 'defensor',      6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupo_membresias (grupo_id, player_id, tipo, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', 'titular', 'activo'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f2', 'titular', 'activo');

-- Conv NORMAL (no presentismo) en e1, para el test 10.
insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, modo, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c9', current_date + 5, '20:00', 12, 'abierta', 'cerrada',
   '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1');

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

-- Actuamos como el coordinador de e1.
select _as('00000000-0000-0000-0000-0000000000a2');

-- abrir_cancha y capturamos la conv.
create temporary table _c on commit drop as
select public.abrir_cancha('00000000-0000-0000-0000-0000000000e1', current_date + 3) as conv_id;

-- 1. La conv es presentismo y abierta.
select is(
  (select modo::text || '/' || status::text from public.convocatorias where id = (select conv_id from _c)),
  'presentismo/abierta',
  'abrir_cancha crea una convocatoria presentismo abierta'
);

-- 2. cierre_at NULL (el cron la ignora).
select ok(
  (select cierre_at is null from public.convocatorias where id = (select conv_id from _c)),
  'la sesión presentismo nace con cierre_at NULL'
);

-- 3. check-in de un miembro.
select lives_ok(
  $$ select public.checkin_miembro(
       (select conv_id from _c), '00000000-0000-0000-0000-0000000000f1') $$,
  'checkin_miembro no falla'
);
select is(
  (select count(*)::int from public.convocatoria_players
     where convocatoria_id = (select conv_id from _c)
       and player_id = '00000000-0000-0000-0000-0000000000f1'
       and llegada_at is not null
       and attendance_status = 'confirmado'),
  1,
  'el miembro queda en el present-list (llegada_at, confirmado)'
);

-- 4. check-in duplicado.
select throws_ok(
  $$ select public.checkin_miembro(
       (select conv_id from _c), '00000000-0000-0000-0000-0000000000f1') $$,
  'P0059',
  null,
  'el check-in duplicado del mismo miembro falla'
);

-- 5 + 6. probador.
create temporary table _p on commit drop as
select (public.checkin_probador((select conv_id from _c), 'NN Probador') ->> 'player_id')::uuid as pid;

select is(
  (select is_guest from public.players where id = (select pid from _p)),
  true,
  'el probador se crea con is_guest = true'
);
select is(
  (select count(*)::int from public.convocatoria_players
     where convocatoria_id = (select conv_id from _c) and llegada_at is not null),
  2,
  'el present-list pasa a 2 (miembro + probador)'
);

-- 7. quitar al miembro.
select lives_ok(
  $$ select public.quitar_checkin(
       (select conv_id from _c), '00000000-0000-0000-0000-0000000000f1') $$,
  'quitar_checkin no falla'
);
select is(
  (select count(*)::int from public.convocatoria_players
     where convocatoria_id = (select conv_id from _c) and llegada_at is not null),
  1,
  'tras quitar al miembro el present-list vuelve a 1'
);

-- 8. guardar armado.
select public.guardar_armado_presentismo(
  (select conv_id from _c), '{"numTeams": 2, "teamSize": 5}'::jsonb);
select is(
  (select presentismo_armado ->> 'numTeams' from public.convocatorias where id = (select conv_id from _c)),
  '2',
  'guardar_armado_presentismo persiste el snapshot'
);

-- 9. grupo ajeno.
select throws_ok(
  $$ select public.abrir_cancha('00000000-0000-0000-0000-0000000000e2', current_date + 3) $$,
  'P0013',
  null,
  'abrir_cancha en un grupo que no coordina falla'
);

-- 10. check-in en una conv NO presentismo.
select throws_ok(
  $$ select public.checkin_miembro(
       '00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000f2') $$,
  'P0080',
  null,
  'checkin_miembro en una conv no-presentismo falla con P0080'
);

select * from finish();
rollback;
