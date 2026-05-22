-- ============================================================================
-- FUT-31 (parte 2): P0004 invalid_status aislado, sin UPDATE en setup
-- ============================================================================
--
-- Los tests P0004 en functions_phase2.sql fallaban en CI porque approve/flag
-- haciendo FOR UPDATE sobre un row que habia sido UPDATE-ado en el mismo
-- transaction (para llevarlo a estado terminal) causaba que la exception
-- escapara del EXCEPTION WHEN OTHERS del wrapper (EXECUTE y PERFORM ambos).
--
-- Workaround: aca insertamos el row DIRECTAMENTE en estado terminal,
-- deshabilitando temporalmente el trigger player_change_requests_normalize_insert.
-- Sin UPDATE en historia, approve raisea limpiamente y el wrapper lo captura.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

-- Setup minimo
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

-- Insertar requests DIRECTAMENTE en estado terminal, sin pasar por
-- UPDATE. Deshabilitamos el trigger FUT-24 normalize_insert para que
-- respete los valores enviados.
alter table public.player_change_requests
  disable trigger player_change_requests_normalize_insert;

insert into public.player_change_requests
  (id, player_id, action_type, requested_by, proposed_values, reason,
   status, reviewed_by, reviewed_at)
values
  -- approved
  ('00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000000b1',
   'update_sensitive_fields',
   '00000000-0000-0000-0000-0000000000a1',
   jsonb_build_object('technical', 8),
   'seed approved',
   'approved',
   '00000000-0000-0000-0000-0000000000a2',
   now()),
  -- flagged
  ('00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000b1',
   'deactivate_player',
   '00000000-0000-0000-0000-0000000000a1',
   '{}'::jsonb,
   'seed flagged',
   'flagged',
   '00000000-0000-0000-0000-0000000000a2',
   now());

alter table public.player_change_requests
  enable trigger player_change_requests_normalize_insert;

-- Helpers
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

create or replace function _call_approve(p_id uuid)
returns text language plpgsql as $$
begin
  perform public.approve_player_change_request(p_id);
  return 'NO_ERROR';
exception when others then
  return sqlerrm;
end;
$$;

create or replace function _call_flag(p_id uuid)
returns text language plpgsql as $$
begin
  perform public.flag_player_change_request(p_id);
  return 'NO_ERROR';
exception when others then
  return sqlerrm;
end;
$$;

select plan(2);

select _as('00000000-0000-0000-0000-0000000000a2');

-- 1. approve sobre request approved -> invalid_status.
select is(
  _call_approve('00000000-0000-0000-0000-0000000000c1'::uuid),
  'invalid_status',
  'approve: P0004 invalid_status sobre request ya approved'
);

-- 2. flag sobre request flagged -> invalid_status.
select is(
  _call_flag('00000000-0000-0000-0000-0000000000e1'::uuid),
  'invalid_status',
  'flag: P0004 invalid_status sobre request ya flagged'
);

select * from finish();
rollback;
