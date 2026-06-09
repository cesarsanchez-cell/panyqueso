-- ============================================================================
-- Veedor opcional: tests del parámetro + admin_apply_sensitive_change
-- ============================================================================
--
--   1. requiere_veedor() arranca en false (desactivado).
--   2. Un no-admin no puede tocar el parámetro (P0013).
--   3. Con el gate off, el admin aplica directo una solicitud de rating...
--   4. ...el rating queda aplicado en el player...
--   5. ...y la solicitud queda 'approved'.
--   6. El admin puede activar el gate (requiere_veedor() = true).
--   7. Con el gate on, admin_apply_sensitive_change falla (P0012).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000',
   'admin-veo@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000',
   'player-veo@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set role = 'player', nombre = 'Player' where id = '00000000-0000-0000-0000-0000000000c2';

insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by
) values
  ('00000000-0000-0000-0000-0000000000d1', 'Jug', 30, 'jugador_campo', 'defensor', 5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000c1');

-- Dos solicitudes pendientes (insert en contexto de test => bypassa RLS).
insert into public.player_change_requests (
  id, action_type, player_id, requested_by, proposed_values, old_values, fields_changed, reason
) values
  ('00000000-0000-0000-0000-0000000000e1', 'update_sensitive_fields',
   '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1',
   '{"technical": 7}'::jsonb, '{"technical": 5}'::jsonb, array['technical'], 'test'),
  ('00000000-0000-0000-0000-0000000000e2', 'update_sensitive_fields',
   '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1',
   '{"mental": 8}'::jsonb, '{"mental": 5}'::jsonb, array['mental'], 'test');

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select plan(7);

-- 1. Arranca desactivado.
select is(public.requiere_veedor(), false, 'requiere_veedor() arranca en false');

-- 2. Un no-admin no puede tocar el parámetro.
select _as('00000000-0000-0000-0000-0000000000c2');
select throws_ok(
  'select public.set_requiere_veedor(true)',
  'P0013',
  null,
  'un no-admin no puede cambiar requiere_veedor (P0013)'
);

-- 3-5. Con gate off, el admin aplica directo.
select _as('00000000-0000-0000-0000-0000000000c1');
select lives_ok(
  'select public.admin_apply_sensitive_change(''00000000-0000-0000-0000-0000000000e1'', ''ok'')',
  'admin aplica directo con el gate off'
);
select is(
  (select technical from public.players where id = '00000000-0000-0000-0000-0000000000d1'),
  7,
  'el rating quedó aplicado en el player'
);
select is(
  (select status from public.player_change_requests where id = '00000000-0000-0000-0000-0000000000e1')::text,
  'approved',
  'la solicitud quedó marcada como approved'
);

-- 6. El admin activa el gate.
select _as('00000000-0000-0000-0000-0000000000c1');
select public.set_requiere_veedor(true);
select is(public.requiere_veedor(), true, 'el admin pudo activar el gate');

-- 7. Con el gate on, admin_apply ya no aplica directo.
select _as('00000000-0000-0000-0000-0000000000c1');
select throws_ok(
  'select public.admin_apply_sensitive_change(''00000000-0000-0000-0000-0000000000e2'')',
  'P0012',
  null,
  'con el gate on, admin_apply_sensitive_change falla (P0012)'
);

select * from finish();
rollback;
