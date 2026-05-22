-- ============================================================================
-- FUT-31: tests pgTAP de las funciones SECURITY DEFINER de Fase 2
-- ============================================================================
--
-- Cubre approve_player_change_request, reject_player_change_request y
-- flag_player_change_request. Verifica error codes (P0001-P0008) y los
-- happy paths principales.
--
-- Setup:
--   - a1: admin (proponente).
--   - a2: veedor1 (reviewer principal).
--   - a3: veedor2 (usado para "cannot_approve_own": insertamos requests con
--     requested_by=a3 y veedor a3 intenta aprobarlos).
--   - Cada test crea su propio request fresco para aislar estado.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

-- ---------------------------------------------------------------------------
-- Setup: usuarios
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
   'veedor1@test.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a3',
   '00000000-0000-0000-0000-000000000000',
   'veedor2@test.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin'
 where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'veedor', nombre = 'Veedor 1'
 where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set role = 'veedor', nombre = 'Veedor 2'
 where id = '00000000-0000-0000-0000-0000000000a3';

-- Player approved que sera target de updates.
insert into public.players (
  id, nombre, edad, role_field, position_pref,
  technical, physical, mental, status, created_by
) values (
  '00000000-0000-0000-0000-0000000000b1',
  'Player Approved', 30, 'jugador_campo', 'mediocampista',
  6, 6, 6, 'approved',
  '00000000-0000-0000-0000-0000000000a1'
);

-- Helper de identidad.
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

create or replace function _as_postgres()
returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Helper: crea un request fresco con un UUID dado. Bypass de RLS/triggers
-- via postgres + session var. Usamos cuando necesitamos un request con
-- requested_by especifico (por ejemplo para test cannot_*_own_request).
create or replace function _seed_request(
  p_id uuid,
  p_requested_by uuid,
  p_action public.change_request_action default 'update_sensitive_fields',
  p_proposed jsonb default jsonb_build_object('technical', 8),
  p_old jsonb default null
) returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  -- El trigger normalize de FUT-24 sobreescribe requested_by con
  -- auth.uid(). Si auth.uid() es null (no JWT), el trigger respeta el
  -- valor enviado. Aseguramos esto limpiando el JWT.
  perform set_config('request.jwt.claims', '', true);

  insert into public.player_change_requests
    (id, player_id, action_type, requested_by, proposed_values, old_values, reason)
  values
    (p_id,
     case when p_action = 'create_player' then null::uuid
          else '00000000-0000-0000-0000-0000000000b1'::uuid end,
     p_action, p_requested_by, p_proposed, p_old, 'test seed');
end;
$$;

-- ---------------------------------------------------------------------------
-- pgTAP plan
-- ---------------------------------------------------------------------------
select plan(20);

-- ===========================================================================
-- approve_player_change_request
-- ===========================================================================

-- 1. P0001 auth_required: sin JWT.
select _as_postgres();
select _seed_request(
  '00000000-0000-0000-0000-0000000000c1'::uuid,
  '00000000-0000-0000-0000-0000000000a1'::uuid
);
-- Caller authenticated sin sub: auth.uid() devuelve null.
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{}'::text, true);
select throws_like(
  $$select public.approve_player_change_request('00000000-0000-0000-0000-0000000000c1'::uuid)$$,
  '%auth_required%',
  'approve: auth_required (P0001) cuando no hay auth.uid()'
);

-- 2. P0002 request_not_found.
select _as('00000000-0000-0000-0000-0000000000a2');
select throws_like(
  $$select public.approve_player_change_request('00000000-0000-0000-0000-0000000000ff'::uuid)$$,
  '%request_not_found%',
  'approve: request_not_found (P0002)'
);

-- 3. P0003 not_a_veedor: admin intentando aprobar.
select _as('00000000-0000-0000-0000-0000000000a1');
select throws_like(
  $$select public.approve_player_change_request('00000000-0000-0000-0000-0000000000c1'::uuid)$$,
  '%not_a_veedor%',
  'approve: not_a_veedor (P0003) si caller no es veedor'
);

-- 4. P0005 cannot_approve_own_request: seed con requested_by=veedor2,
--    veedor2 intenta aprobar.
select _seed_request(
  '00000000-0000-0000-0000-0000000000c2'::uuid,
  '00000000-0000-0000-0000-0000000000a3'::uuid
);
select _as('00000000-0000-0000-0000-0000000000a3');
select throws_like(
  $$select public.approve_player_change_request('00000000-0000-0000-0000-0000000000c2'::uuid)$$,
  '%cannot_approve_own_request%',
  'approve: cannot_approve_own_request (P0005) si reviewer = requester'
);

-- 5. Happy path update_sensitive_fields: veedor1 aprueba request del admin.
--    Verifica que player.technical cambia y el request queda approved.
select _as('00000000-0000-0000-0000-0000000000a2');
select lives_ok(
  $$select public.approve_player_change_request('00000000-0000-0000-0000-0000000000c1'::uuid)$$,
  'approve update_sensitive_fields: lives_ok'
);

select _as_postgres();
select results_eq(
  $$select technical from public.players where id = '00000000-0000-0000-0000-0000000000b1'$$,
  $$values (8)$$,
  'approve update_sensitive_fields: player.technical actualizado'
);

select is(
  (select status::text from public.player_change_requests
    where id = '00000000-0000-0000-0000-0000000000c1'),
  'approved',
  'approve: request queda en status=approved'
);

select is(
  (select count(*)::int from public.audit_log
    where entity = 'player_change_request'
      and entity_id = '00000000-0000-0000-0000-0000000000c1'
      and action = 'approve_change_request'),
  1,
  'approve: audit_log con action=approve_change_request'
);

-- 6. P0004 invalid_status: intentar approve sobre uno ya approved.
select _as('00000000-0000-0000-0000-0000000000a2');
select throws_like(
  $$select public.approve_player_change_request('00000000-0000-0000-0000-0000000000c1'::uuid)$$,
  '%invalid_status%',
  'approve: invalid_status (P0004) sobre request ya approved'
);

-- 7. P0007 stale_request: seed con old_values que NO coincide con player.
--    technical actual = 8, old_values dice technical=99.
select _seed_request(
  '00000000-0000-0000-0000-0000000000c3'::uuid,
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'update_sensitive_fields',
  jsonb_build_object('technical', 5),
  jsonb_build_object('technical', '99')
);
select _as('00000000-0000-0000-0000-0000000000a2');
select throws_like(
  $$select public.approve_player_change_request('00000000-0000-0000-0000-0000000000c3'::uuid)$$,
  '%stale_request%',
  'approve: stale_request (P0007) si old_values no coincide con player actual'
);

-- 8. Happy path deactivate_player.
select _seed_request(
  '00000000-0000-0000-0000-0000000000c4'::uuid,
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'deactivate_player',
  '{}'::jsonb
);
select _as('00000000-0000-0000-0000-0000000000a2');
select lives_ok(
  $$select public.approve_player_change_request('00000000-0000-0000-0000-0000000000c4'::uuid)$$,
  'approve deactivate_player: lives_ok'
);

select _as_postgres();
select is(
  (select status::text from public.players where id = '00000000-0000-0000-0000-0000000000b1'),
  'inactive',
  'approve deactivate_player: player.status=inactive'
);

-- ===========================================================================
-- reject_player_change_request
-- ===========================================================================

-- 9. P0003 not_a_veedor.
select _seed_request(
  '00000000-0000-0000-0000-0000000000d1'::uuid,
  '00000000-0000-0000-0000-0000000000a1'::uuid
);
select _as('00000000-0000-0000-0000-0000000000a1');
select throws_like(
  $$select public.reject_player_change_request('00000000-0000-0000-0000-0000000000d1'::uuid)$$,
  '%not_a_veedor%',
  'reject: not_a_veedor (P0003)'
);

-- 10. P0005 cannot_reject_own_request: veedor2 reject sobre su propio.
select _seed_request(
  '00000000-0000-0000-0000-0000000000d2'::uuid,
  '00000000-0000-0000-0000-0000000000a3'::uuid
);
select _as('00000000-0000-0000-0000-0000000000a3');
select throws_like(
  $$select public.reject_player_change_request('00000000-0000-0000-0000-0000000000d2'::uuid)$$,
  '%cannot_reject_own_request%',
  'reject: cannot_reject_own_request (P0005)'
);

-- 11. Happy path reject + audit + player intacto.
--     Antes del reject, reactivamos el player que el test 8 dejo inactive.
select _as_postgres();
select set_config('app.applying_change_request', 'true', true);
update public.players set status = 'approved'
 where id = '00000000-0000-0000-0000-0000000000b1';
select set_config('app.applying_change_request', '', true);

select _as('00000000-0000-0000-0000-0000000000a2');
select lives_ok(
  $$select public.reject_player_change_request('00000000-0000-0000-0000-0000000000d1'::uuid, 'no convence')$$,
  'reject: lives_ok'
);

select _as_postgres();
select is(
  (select status::text from public.player_change_requests
    where id = '00000000-0000-0000-0000-0000000000d1'),
  'rejected',
  'reject: request queda en status=rejected'
);

-- ===========================================================================
-- flag_player_change_request
-- ===========================================================================

-- 12. P0005 cannot_flag_own_request.
select _seed_request(
  '00000000-0000-0000-0000-0000000000e1'::uuid,
  '00000000-0000-0000-0000-0000000000a3'::uuid
);
select _as('00000000-0000-0000-0000-0000000000a3');
select throws_like(
  $$select public.flag_player_change_request('00000000-0000-0000-0000-0000000000e1'::uuid)$$,
  '%cannot_flag_own_request%',
  'flag: cannot_flag_own_request (P0005)'
);

-- 13. Happy path flag: pending -> flagged.
select _seed_request(
  '00000000-0000-0000-0000-0000000000e2'::uuid,
  '00000000-0000-0000-0000-0000000000a1'::uuid
);
select _as('00000000-0000-0000-0000-0000000000a2');
select lives_ok(
  $$select public.flag_player_change_request('00000000-0000-0000-0000-0000000000e2'::uuid, 'segunda opinion')$$,
  'flag: lives_ok'
);

select _as_postgres();
select is(
  (select status::text from public.player_change_requests
    where id = '00000000-0000-0000-0000-0000000000e2'),
  'flagged',
  'flag: request queda en status=flagged'
);

-- 14. P0004 invalid_status: intentar flag sobre uno ya flagged.
select _as('00000000-0000-0000-0000-0000000000a2');
select throws_like(
  $$select public.flag_player_change_request('00000000-0000-0000-0000-0000000000e2'::uuid)$$,
  '%invalid_status%',
  'flag: invalid_status (P0004) sobre request ya flagged'
);

-- ---------------------------------------------------------------------------
select * from finish();
rollback;
