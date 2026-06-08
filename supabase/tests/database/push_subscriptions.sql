-- ============================================================================
-- Notificaciones push (Fase 1): tests de push_subscriptions + RPCs
-- ============================================================================
--
--   1. save_push_subscription guarda la suscripción del jugador actual.
--   2. Re-guardar el mismo endpoint hace upsert (no duplica).
--   3. RLS: un jugador NO ve las suscripciones de otro.
--   4. delete_push_subscription da de baja la propia.
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
   'admin-push@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'p1-push@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000000',
   'p2-push@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'player', nombre = 'P1'    where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set role = 'player', nombre = 'P2'    where id = '00000000-0000-0000-0000-0000000000a3';

insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, auth_user_id
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'jugador_campo', 'defensor', 5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000b2', 'P2', 30, 'jugador_campo', 'defensor', 5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3');

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select plan(4);

-- 1. P1 guarda una suscripción y la ve.
select _as('00000000-0000-0000-0000-0000000000a2');
select public.save_push_subscription('https://push.example/ep1', 'key-p256dh', 'key-auth', 'test-ua');
select is(
  (select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example/ep1'),
  1,
  'save_push_subscription guarda la suscripción del jugador'
);

-- 2. Re-guardar el mismo endpoint hace upsert (no duplica).
select public.save_push_subscription('https://push.example/ep1', 'key-p256dh-2', 'key-auth-2', 'test-ua');
select is(
  (select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example/ep1'),
  1,
  're-guardar el mismo endpoint no duplica (upsert)'
);

-- 3. RLS: P2 no ve la suscripción de P1.
select _as('00000000-0000-0000-0000-0000000000a3');
select is(
  (select count(*)::int from public.push_subscriptions),
  0,
  'un jugador no ve las suscripciones de otro (RLS)'
);

-- 4. P1 da de baja la suya.
select _as('00000000-0000-0000-0000-0000000000a2');
select public.delete_push_subscription('https://push.example/ep1');
select is(
  (select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example/ep1'),
  0,
  'delete_push_subscription da de baja la propia'
);

select * from finish();
rollback;
