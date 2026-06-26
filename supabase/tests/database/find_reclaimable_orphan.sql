-- ============================================================================
-- Tests: find_reclaimable_orphan
-- ============================================================================
--
-- Cubre:
--   1. Cuenta sin ficha + nunca logueada → devuelve su id (reclamable).
--   2. Cuenta sin ficha pero YA logueada → null (cuenta real, no se toca).
--   3. Cuenta con ficha (aunque nunca logueada) → null (no es huérfana).
--   4. Celular sin ninguna cuenta de auth → null.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

-- Setup: auth users -----------------------------------------------------------
-- a0 admin; b1 huérfano (sin ficha, nunca logueó); b2 sin ficha pero logueó;
-- c3 cuenta con ficha (nunca logueó).
insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-000000000000',
   'admin-fro@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), now(),
   '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000',
   '+5491100000001@phone.fdlm.local', '', 'authenticated', 'authenticated', now(), now(), now(), null,
   '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000000',
   '+5491100000002@phone.fdlm.local', '', 'authenticated', 'authenticated', now(), now(), now(), now(),
   '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000',
   '+5491100000003@phone.fdlm.local', '', 'authenticated', 'authenticated', now(), now(), now(), null,
   '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin', nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a0';

-- Ficha vinculada a c3 (celular ...0003). o1 y o2 NO tienen ficha.
insert into public.players (
  id, nombre, edad, role_field, position_pref,
  technical, physical, mental, status, created_by, auth_user_id, phone
) values
  ('00000000-0000-0000-0000-0000000000d3', 'ConFicha', 30, 'jugador_campo', 'mediocampista',
   6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000c3', '+5491100000003');

select plan(4);

-- 1. Sin ficha + nunca logueada → reclamable (devuelve su id).
select is(
  public.find_reclaimable_orphan('+5491100000001'),
  '00000000-0000-0000-0000-0000000000b1'::uuid,
  'huérfano sin ficha y nunca logueado → devuelve su id'
);

-- 2. Sin ficha pero YA logueada → null (cuenta real).
select is(
  public.find_reclaimable_orphan('+5491100000002'),
  null,
  'cuenta sin ficha pero ya logueada → null (no se toca)'
);

-- 3. Con ficha (nunca logueó) → null (no es huérfana).
select is(
  public.find_reclaimable_orphan('+5491100000003'),
  null,
  'cuenta con ficha → null aunque nunca haya logueado'
);

-- 4. Celular sin ninguna cuenta → null.
select is(
  public.find_reclaimable_orphan('+5491199999999'),
  null,
  'celular sin cuenta de auth → null'
);

select * from finish();
rollback;
