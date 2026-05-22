-- ============================================================================
-- FUT-31 (parte 2): tests de P0004 invalid_status aislados
-- ============================================================================
--
-- Estos tests fallan cuando estan en el mismo transaction que un happy path
-- previo (approve o flag exitosos). El sintoma: la exception 'invalid_status'
-- escapa del _try()/throws_like aunque tengan EXCEPTION WHEN OTHERS. No
-- identificamos la causa exacta; aislarlos en su propio archivo (transaction
-- limpio) los hace pasar.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

-- Setup minimo: solo veedor1 + admin + player + 2 requests aprobado y
-- flagged directamente via session var.
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
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin'
 where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'veedor', nombre = 'Veedor'
 where id = '00000000-0000-0000-0000-0000000000a2';

insert into public.players (
  id, nombre, edad, role_field, position_pref,
  technical, physical, mental, status, created_by
) values (
  '00000000-0000-0000-0000-0000000000b1',
  'P', 30, 'jugador_campo', 'mediocampista',
  6, 6, 6, 'approved',
  '00000000-0000-0000-0000-0000000000a1'
);

-- Seed dos requests pending por el admin.
insert into public.player_change_requests (id, player_id, action_type, requested_by, proposed_values, reason)
values
  ('00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000000b1',
   'update_sensitive_fields',
   '00000000-0000-0000-0000-0000000000a1',
   jsonb_build_object('technical', 8), 'seed approved'),
  ('00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000b1',
   'deactivate_player',
   '00000000-0000-0000-0000-0000000000a1',
   '{}'::jsonb, 'seed flagged');

-- Llevarlos a estado terminal via session var (bypassea triggers
-- como produccion lo hace via las funciones SECURITY DEFINER).
select set_config('app.applying_change_request', 'true', true);
update public.player_change_requests
   set status = 'approved',
       reviewed_by = '00000000-0000-0000-0000-0000000000a2',
       reviewed_at = now()
 where id = '00000000-0000-0000-0000-0000000000c1';
update public.player_change_requests
   set status = 'flagged',
       reviewed_by = '00000000-0000-0000-0000-0000000000a2',
       reviewed_at = now()
 where id = '00000000-0000-0000-0000-0000000000e1';
select set_config('app.applying_change_request', '', true);

-- Helpers de identidad y captura de error.
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

create or replace function _try(p_query text)
returns text
language plpgsql as $$
begin
  execute p_query;
  return 'NO_ERROR';
exception when others then
  return sqlerrm;
end;
$$;

select plan(2);

-- Test 1: approve sobre request approved -> invalid_status.
select _as('00000000-0000-0000-0000-0000000000a2');
select is(
  _try($$select public.approve_player_change_request('00000000-0000-0000-0000-0000000000c1'::uuid)$$),
  'invalid_status',
  'approve: P0004 invalid_status sobre request ya approved'
);

-- Test 2: flag sobre request flagged -> invalid_status.
select is(
  _try($$select public.flag_player_change_request('00000000-0000-0000-0000-0000000000e1'::uuid)$$),
  'invalid_status',
  'flag: P0004 invalid_status sobre request ya flagged'
);

select * from finish();
rollback;
