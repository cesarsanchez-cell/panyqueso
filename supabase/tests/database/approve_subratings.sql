-- ============================================================================
-- FUT-86 2b: approve_player_change_request aplica los 9 sub-ratings
-- ============================================================================
--
-- Cubre: un update_sensitive_fields con los 9 subs + dimensiones, aprobado por
-- el veedor, deja el player con los subs aplicados y el internal_score
-- recalculado con la fórmula v2.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000',
   'veedor-sub@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000000',
   'admin-sub@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'veedor', nombre = 'Veedor' where id = '00000000-0000-0000-0000-0000000000e1';
update public.profiles set role = 'admin',  nombre = 'Admin'  where id = '00000000-0000-0000-0000-0000000000e2';

-- Player inicial: 5/5/5, edad 30.
insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by
) values
  ('00000000-0000-0000-0000-0000000000b9', 'Sub Player', 30, 'jugador_campo', 'delantero', 5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000e2');

-- Request de update_sensitive_fields con los 9 subs + dimensiones (promedios).
insert into public.player_change_requests (
  id, action_type, player_id, requested_by, status, proposed_values, old_values, fields_changed, reason
) values (
  '00000000-0000-0000-0000-00000000a001',
  'update_sensitive_fields',
  '00000000-0000-0000-0000-0000000000b9',
  '00000000-0000-0000-0000-0000000000e2',
  'pending',
  jsonb_build_object(
    'technical', 10, 'physical', 6, 'mental', 8,
    'phys_power', 6, 'phys_speed', 6, 'phys_stamina', 6,
    'ment_tactical', 8, 'ment_resilience', 8, 'ment_attitude', 8,
    'tech_passing', 10, 'tech_finishing', 10, 'tech_linkup', 10
  ),
  null,
  array['technical','physical','mental','phys_power','phys_speed','phys_stamina','ment_tactical','ment_resilience','ment_attitude','tech_passing','tech_finishing','tech_linkup'],
  'carga de subs'
);

-- Actuar como el veedor (auth.uid() = veedor) y aprobar.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000e1', 'role', 'authenticated')::text, true);
select set_config('role', 'authenticated', true);

select public.approve_player_change_request('00000000-0000-0000-0000-00000000a001', 'ok');

-- Volver a superuser para leer sin trabas de RLS.
select set_config('role', 'postgres', true);

select plan(4);

select is(
  (select phys_power from public.players where id = '00000000-0000-0000-0000-0000000000b9'),
  6,
  'approve aplicó phys_power = 6'
);

select is(
  (select tech_passing from public.players where id = '00000000-0000-0000-0000-0000000000b9'),
  10,
  'approve aplicó tech_passing = 10'
);

select is(
  (select technical from public.players where id = '00000000-0000-0000-0000-0000000000b9'),
  10,
  'approve aplicó la dimensión technical = 10'
);

-- internal_score v2: físico 6 × factor(30)=1.0 × 0.35 + mental 8 × 0.325 + técnica 10 × 0.325
--                  = 2.10 + 2.60 + 3.25 = 7.95
select is(
  (select internal_score from public.players where id = '00000000-0000-0000-0000-0000000000b9'),
  7.95::numeric,
  'internal_score recalculado con v2 → 7.95'
);

select * from finish();
rollback;
