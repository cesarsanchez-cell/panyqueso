-- ============================================================================
-- Fase 5 hotfix: tests de la policy DELETE de convocatoria_players
-- ============================================================================
--
-- Cubre:
--   - admin puede DELETE convocatoria_players.
--   - veedor NO puede DELETE (policy filtra fila).
--   - sin rol NO puede DELETE.
--   - convocatorias: admin puede DELETE las 'abierta' (Bug 5: cancelar =
--     eliminar) pero NO las 'cerrada'/'jugada' (la policy restringe a abierta).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

-- ---------------------------------------------------------------------------
-- Setup: usuarios + un player + una convocatoria + un convocado
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000000',
   'admin-cp-del@test.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-000000000000',
   'veedor-cp-del@test.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a3',
   '00000000-0000-0000-0000-000000000000',
   'sinrol-cp-del@test.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles
   set role = 'admin', nombre = 'Test Admin'
 where id = '00000000-0000-0000-0000-0000000000a1';

update public.profiles
   set role = 'veedor', nombre = 'Test Veedor'
 where id = '00000000-0000-0000-0000-0000000000a2';

-- Player approved.
insert into public.players (
  id, nombre, edad, role_field, position_pref,
  technical, physical, mental, status, created_by
) values (
  '00000000-0000-0000-0000-0000000000b1',
  'Convocado Test',
  30, 'jugador_campo', 'mediocampista',
  6, 6, 6, 'approved',
  '00000000-0000-0000-0000-0000000000a1'
);

-- Convocatoria abierta (c1) y una cerrada (c2) para los asserts de DELETE.
insert into public.convocatorias (
  id, fecha, hora, cupo_maximo, status, created_by
) values
  ('00000000-0000-0000-0000-0000000000c1',
   current_date + 1, '20:00', 12, 'abierta',
   '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000c2',
   current_date + 1, '20:00', 12, 'cerrada',
   '00000000-0000-0000-0000-0000000000a1');

-- 3 convocados (uno por test, asi DELETE no se pisa entre asserts).
insert into public.convocatoria_players (id, convocatoria_id, player_id, rol_en_convocatoria)
values
  ('00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000000b1',
   'titular');

-- Necesitamos varios players para 3 filas convocadas. Insertamos extras.
insert into public.players (id, nombre, edad, role_field, position_pref,
  technical, physical, mental, status, created_by) values
  ('00000000-0000-0000-0000-0000000000b2', 'Player2', 28, 'jugador_campo',
   'defensor', 5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b3', 'Player3', 27, 'jugador_campo',
   'delantero', 7, 7, 7, 'approved', '00000000-0000-0000-0000-0000000000a1');

insert into public.convocatoria_players (id, convocatoria_id, player_id, rol_en_convocatoria) values
  ('00000000-0000-0000-0000-0000000000d2',
   '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000000b2',
   'titular'),
  ('00000000-0000-0000-0000-0000000000d3',
   '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000000b3',
   'titular');

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Plan
-- ---------------------------------------------------------------------------
select plan(5);

-- 1. veedor NO puede DELETE (policy filtra fila).
select _as('00000000-0000-0000-0000-0000000000a2');
select is_empty(
  $$delete from public.convocatoria_players
     where id = '00000000-0000-0000-0000-0000000000d1' returning 1$$,
  'veedor: DELETE filtrado por policy (is_empty)'
);

-- 2. sin rol NO puede DELETE.
select _as('00000000-0000-0000-0000-0000000000a3');
select is_empty(
  $$delete from public.convocatoria_players
     where id = '00000000-0000-0000-0000-0000000000d1' returning 1$$,
  'sin rol: DELETE filtrado por policy (is_empty)'
);

-- 3. admin SI puede DELETE.
select _as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$delete from public.convocatoria_players
     where id = '00000000-0000-0000-0000-0000000000d2'$$,
  'admin: DELETE lives_ok'
);

-- 4. Bug 5: admin SI puede DELETE una convocatoria 'abierta' (cascada en
-- convocatoria_players via FK ON DELETE CASCADE).
select _as('00000000-0000-0000-0000-0000000000a1');
select isnt_empty(
  $$delete from public.convocatorias
     where id = '00000000-0000-0000-0000-0000000000c1' returning 1$$,
  'convocatorias: admin DELETE de una abierta funciona (Bug 5)'
);

-- 5. admin NO puede DELETE una convocatoria 'cerrada' (la policy restringe a
-- status='abierta'; cerrada/jugada conservan historia).
select _as('00000000-0000-0000-0000-0000000000a1');
select is_empty(
  $$delete from public.convocatorias
     where id = '00000000-0000-0000-0000-0000000000c2' returning 1$$,
  'convocatorias: admin NO puede DELETE una cerrada (policy filtra la fila)'
);

select * from finish();
rollback;
