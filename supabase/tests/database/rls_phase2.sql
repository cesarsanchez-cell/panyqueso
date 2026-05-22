-- ============================================================================
-- FUT-30: tests pgTAP de RLS de Fase 2
-- ============================================================================
--
-- Cubre la lista obligatoria del plan v4 seccion 6:
--   - admin no puede UPDATE directo de campos sensibles en players.
--   - admin no puede INSERT directo en players.
--   - admin no puede UPDATE directo en player_change_requests.
--   - veedor no puede UPDATE directo en player_change_requests.
--   - cliente que intenta INSERT con reviewed_by/status -> normalizado por
--     trigger a pending + reviewed_by null.
--   - usuario sin rol no accede a nada.
--   - request en approved/rejected es inmutable.
--
-- Mas: profiles UPDATE de nombre por self, role inmutable desde API,
-- audit_log SELECT solo admin/veedor.
--
-- Estrategia:
--   - Insertar 3 usuarios de prueba en auth.users (admin, veedor, sin_rol).
--   - El trigger handle_new_user (FUT-9) crea los profiles vacios.
--   - Setear role manualmente en cada profile (admin, veedor).
--   - Cambiar de identidad via set_config('role', 'authenticated') +
--     set_config('request.jwt.claims', ...). auth.uid() lee de ahi.
--   - Todo dentro de un transaction que rolledback al final.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

-- Garantizamos que las funciones pgTAP (is, lives_ok, throws_like, is_empty,
-- results_eq, etc.) se resuelvan sin prefijo aun despues de cambiar de role.
set local search_path = public, extensions, "$user";

-- ---------------------------------------------------------------------------
-- Setup: 3 usuarios de prueba
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000000',
   'admin@test.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-000000000000',
   'veedor@test.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a3',
   '00000000-0000-0000-0000-000000000000',
   'sinrol@test.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

-- El trigger handle_new_user creo los profiles. Asignar roles.
update public.profiles
   set role = 'admin', nombre = 'Test Admin'
 where id = '00000000-0000-0000-0000-0000000000a1';

update public.profiles
   set role = 'veedor', nombre = 'Test Veedor'
 where id = '00000000-0000-0000-0000-0000000000a2';

-- profile a3 queda con role=null (usuario sin rol).

-- Sembrar un player approved para usarlo de target en updates.
insert into public.players (
  id, nombre, edad, role_field, position_pref,
  technical, physical, mental, status, created_by
) values (
  '00000000-0000-0000-0000-0000000000b1',
  'Player Approved',
  30, 'field_player', 'midfielder',
  6, 6, 6, 'approved',
  '00000000-0000-0000-0000-0000000000a1'
);

-- Sembrar un request pending del admin.
insert into public.player_change_requests (
  id, player_id, action_type, requested_by,
  proposed_values, reason, status
) values (
  '00000000-0000-0000-0000-0000000000c1',
  '00000000-0000-0000-0000-0000000000b1',
  'update_sensitive_fields',
  '00000000-0000-0000-0000-0000000000a1',
  jsonb_build_object('technical', 7),
  'Test pending request',
  'pending'
);

-- Sembrar un request del veedor (para test de SELECT segmentado).
insert into public.player_change_requests (
  id, player_id, action_type, requested_by,
  proposed_values, reason, status
) values (
  '00000000-0000-0000-0000-0000000000c2',
  '00000000-0000-0000-0000-0000000000b1',
  'deactivate_player',
  '00000000-0000-0000-0000-0000000000a2',
  '{}'::jsonb,
  'request del veedor',
  'pending'
);

-- Helper: switch de identidad. Cambia role a authenticated y setea JWT.
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

-- Helper: volver a postgres (rol que corre los .sql).
create or replace function _as_postgres()
returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- pgTAP plan
-- ---------------------------------------------------------------------------
select plan(22);

-- ===========================================================================
-- profiles
-- ===========================================================================

-- 1. user sin rol lee solo su propio profile.
select _as('00000000-0000-0000-0000-0000000000a3');
select is(
  (select count(*) from public.profiles)::int,
  1,
  'sin rol: ve solo su propio profile'
);

-- 2. veedor lee todos los profiles (3 en la tabla).
select _as('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*) from public.profiles)::int,
  3,
  'veedor: ve todos los profiles'
);

-- 3. user puede cambiar SU nombre.
select _as('00000000-0000-0000-0000-0000000000a3');
select lives_ok(
  $$update public.profiles set nombre = 'Cambio Yo' where id = '00000000-0000-0000-0000-0000000000a3'$$,
  'user puede UPDATE su propio nombre'
);

-- 4. user NO puede cambiar SU role (column-level GRANT lo bloquea).
select throws_like(
  $$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a3'$$,
  '%permission denied%',
  'user NO puede UPDATE su role (permission denied por GRANT)'
);

-- 5. user NO puede cambiar el nombre de otro (policy filtra fila).
select is_empty(
  $$update public.profiles set nombre = 'Hackeado'
     where id = '00000000-0000-0000-0000-0000000000a1' returning 1$$,
  'user NO puede UPDATE el profile de otro (policy filtra fila)'
);

-- ===========================================================================
-- players
-- ===========================================================================

-- 6. sin rol no ve players.
select _as('00000000-0000-0000-0000-0000000000a3');
select is(
  (select count(*) from public.players)::int,
  0,
  'sin rol: NO ve players'
);

-- 7. veedor ve players.
select _as('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*) from public.players)::int,
  1,
  'veedor: ve players'
);

-- 8. admin NO puede INSERT directo en players (sin policy de INSERT).
select _as('00000000-0000-0000-0000-0000000000a1');
select throws_like(
  $$insert into public.players (nombre, edad, role_field, position_pref, technical, physical, mental, status)
    values ('X', 25, 'field_player', 'forward', 5, 5, 5, 'approved')$$,
  '%row-level security%',
  'admin NO puede INSERT directo en players'
);

-- 9. admin NO puede UPDATE technical en players (column GRANT denegado).
select _as('00000000-0000-0000-0000-0000000000a1');
select throws_like(
  $$update public.players set technical = 10 where id = '00000000-0000-0000-0000-0000000000b1'$$,
  '%permission denied%',
  'admin NO puede UPDATE technical en players (GRANT lo bloquea)'
);

-- 10. admin SI puede UPDATE private_notes.
select _as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$update public.players set private_notes = 'nota de admin' where id = '00000000-0000-0000-0000-0000000000b1'$$,
  'admin SI puede UPDATE private_notes'
);

-- 11. veedor NO puede UPDATE private_notes (policy admin-only).
select _as('00000000-0000-0000-0000-0000000000a2');
select is_empty(
  $$update public.players set private_notes = 'veedor edita?'
     where id = '00000000-0000-0000-0000-0000000000b1' returning 1$$,
  'veedor NO puede UPDATE private_notes (policy admin-only filtra fila)'
);

-- 12. admin NO puede DELETE players.
select _as('00000000-0000-0000-0000-0000000000a1');
select is_empty(
  $$delete from public.players where id = '00000000-0000-0000-0000-0000000000b1' returning 1$$,
  'admin NO puede DELETE players (sin policy DELETE)'
);

-- ===========================================================================
-- player_change_requests
-- ===========================================================================

-- 13. admin INSERT request: requested_by se fuerza a auth.uid() por trigger.
select _as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$insert into public.player_change_requests (player_id, action_type, requested_by, proposed_values, reason)
    values ('00000000-0000-0000-0000-0000000000b1', 'update_sensitive_fields',
            '00000000-0000-0000-0000-0000000000a2',
            jsonb_build_object('technical', 8), 'intento de spoof')$$,
  'admin INSERT request: lives_ok'
);

-- Verificar que el trigger forzo requested_by.
select _as_postgres();
select is(
  (select requested_by from public.player_change_requests where reason = 'intento de spoof' limit 1),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'INSERT: trigger fuerza requested_by = auth.uid()'
);

-- 14. INSERT con status='approved' y reviewed_by/reviewed_at -> normalizados.
select _as('00000000-0000-0000-0000-0000000000a1');
insert into public.player_change_requests
  (player_id, action_type, requested_by, proposed_values, reason, status, reviewed_by, reviewed_at, review_comment)
values
  ('00000000-0000-0000-0000-0000000000b1', 'update_sensitive_fields',
   '00000000-0000-0000-0000-0000000000a1',
   jsonb_build_object('mental', 9), 'spoof status',
   'approved',
   '00000000-0000-0000-0000-0000000000a2',
   now(),
   'comentario falso');

select _as_postgres();
select results_eq(
  $$select status::text, reviewed_by::text, review_comment
      from public.player_change_requests where reason = 'spoof status' limit 1$$,
  $$values ('pending'::text, null::text, null::text)$$,
  'INSERT con status approved/reviewed_by: trigger normaliza a pending y nulea evidencia'
);

-- 15. veedor NO puede INSERT requests (policy admin-only).
select _as('00000000-0000-0000-0000-0000000000a2');
select throws_like(
  $$insert into public.player_change_requests (player_id, action_type, requested_by, proposed_values, reason)
    values ('00000000-0000-0000-0000-0000000000b1', 'deactivate_player',
            '00000000-0000-0000-0000-0000000000a2', '{}'::jsonb, 'veedor intenta')$$,
  '%row-level security%',
  'veedor NO puede INSERT request'
);

-- 16. sin rol NO puede INSERT requests.
select _as('00000000-0000-0000-0000-0000000000a3');
select throws_like(
  $$insert into public.player_change_requests (player_id, action_type, requested_by, proposed_values, reason)
    values ('00000000-0000-0000-0000-0000000000b1', 'deactivate_player',
            '00000000-0000-0000-0000-0000000000a3', '{}'::jsonb, 'sin rol intenta')$$,
  '%row-level security%',
  'sin rol NO puede INSERT request'
);

-- 17. admin NO puede UPDATE directo en player_change_requests.
select _as('00000000-0000-0000-0000-0000000000a1');
select is_empty(
  $$update public.player_change_requests
       set review_comment = 'admin edita su request'
     where id = '00000000-0000-0000-0000-0000000000c1' returning 1$$,
  'admin NO puede UPDATE directo en player_change_requests'
);

-- 18. veedor NO puede UPDATE directo en player_change_requests.
select _as('00000000-0000-0000-0000-0000000000a2');
select is_empty(
  $$update public.player_change_requests
       set status = 'approved'
     where id = '00000000-0000-0000-0000-0000000000c1' returning 1$$,
  'veedor NO puede UPDATE directo en player_change_requests'
);

-- 19. Request approved es inmutable (trigger FUT-25 P0020 finalized).
select _as_postgres();
-- Mutamos a 'approved' con session var activa para pasar el trigger FUT-25.
select set_config('app.applying_change_request', 'true', true);
update public.player_change_requests
   set status = 'approved',
       reviewed_by = '00000000-0000-0000-0000-0000000000a2',
       reviewed_at = now()
 where id = '00000000-0000-0000-0000-0000000000c1';
-- Apagamos la session var: el proximo UPDATE debe ser rechazado.
select set_config('app.applying_change_request', '', true);
select throws_like(
  $$update public.player_change_requests set review_comment = 'mutate finalized'
     where id = '00000000-0000-0000-0000-0000000000c1'$$,
  '%change_request_finalized%',
  'request approved es inmutable (trigger FUT-25 P0020)'
);

-- 20. admin no ve requests de otros admins/usuarios (policy SELECT own).
select _as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*) from public.player_change_requests
    where requested_by = '00000000-0000-0000-0000-0000000000a2')::int,
  0,
  'admin NO ve requests de otros (policy SELECT own)'
);

-- ===========================================================================
-- audit_log
-- ===========================================================================

-- 21. authenticated sin rol NO ve audit_log.
select _as('00000000-0000-0000-0000-0000000000a3');
select is(
  (select count(*) from public.audit_log)::int,
  0,
  'sin rol: NO ve audit_log'
);

-- 22. authenticated no puede INSERT en audit_log (sin policy).
select _as('00000000-0000-0000-0000-0000000000a1');
select throws_like(
  $$insert into public.audit_log (actor_id, entity, action) values (
    '00000000-0000-0000-0000-0000000000a1', 'player', 'fake_action'
  )$$,
  '%row-level security%',
  'admin NO puede INSERT directo en audit_log'
);

-- ---------------------------------------------------------------------------
select * from finish();
rollback;
