-- ============================================================================
-- Tests: lookup_join_phone_state + activar_jugador_existente
-- ============================================================================
--
-- Cubre:
--   1. lookup → 'nuevo' para un celular que no está en la base.
--   2. lookup → 'login' para una ficha cuya cuenta YA se logueó.
--   3. lookup → 'activar' para una ficha con cuenta que NUNCA se logueó.
--   4. lookup → 'activar' para una ficha SIN cuenta de auth.
--   5. activar → vincula la ficha a la cuenta (auth_user_id).
--   6. activar → asegura membresía activa por cupo (titular si hay lugar).
--   7. activar → profile queda con rol player.
--   8. activar → P0091 si la ficha ya está vinculada a OTRA cuenta.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

-- Setup: auth users -----------------------------------------------------------
-- a0 admin (owner del grupo); a1 nunca logueó; a2 logueó; a3 cuenta nueva a vincular.
insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-000000000000',
   'admin-alae@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), now(),
   '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   '+5491100000001@phone.fdlm.local', '', 'authenticated', 'authenticated', now(), now(), now(), null,
   '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   '+5491100000002@phone.fdlm.local', '', 'authenticated', 'authenticated', now(), now(), now(), now(),
   '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000000',
   '+5491100000003@phone.fdlm.local', '', 'authenticated', 'authenticated', now(), now(), now(), null,
   '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin', nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a0';

-- Players ---------------------------------------------------------------------
-- b1: cuenta nunca logueada (a1). b2: cuenta logueada (a2). b3: SIN cuenta.
insert into public.players (
  id, nombre, edad, role_field, position_pref,
  technical, physical, mental, status, created_by, auth_user_id, phone
) values
  ('00000000-0000-0000-0000-0000000000b1', 'NuncaLogueo', 30, 'jugador_campo', 'mediocampista',
   6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000a1', '+5491100000001'),
  ('00000000-0000-0000-0000-0000000000b2', 'YaLogueo', 28, 'jugador_campo', 'defensor',
   6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000a2', '+5491100000002'),
  ('00000000-0000-0000-0000-0000000000b3', 'SinCuenta', 32, 'jugador_campo', 'delantero',
   6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a0', null, '+5491100000003');

-- Lugar + grupo con join_token --------------------------------------------------
insert into public.lugares (id, nombre, created_by)
values ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a0');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, owner_id, join_token, cupo_titulares)
values ('00000000-0000-0000-0000-0000000000e1', 'Grupo Test', '00000000-0000-0000-0000-00000000000a',
        2, '20:00', '00000000-0000-0000-0000-0000000000a0', 'TESTTOKEN', 5);

select plan(8);

-- 1. Celular desconocido → 'nuevo'.
select is(
  (select estado from public.lookup_join_phone_state('TESTTOKEN', '+5491199999999')),
  'nuevo',
  'lookup: celular no en la base → nuevo'
);

-- 2. Ficha con cuenta YA logueada → 'login'.
select is(
  (select estado from public.lookup_join_phone_state('TESTTOKEN', '+5491100000002')),
  'login',
  'lookup: cuenta ya logueada → login'
);

-- 3. Ficha con cuenta que NUNCA logueó → 'activar'.
select is(
  (select estado from public.lookup_join_phone_state('TESTTOKEN', '+5491100000001')),
  'activar',
  'lookup: cuenta nunca logueada → activar'
);

-- 4. Ficha SIN cuenta de auth → 'activar'.
select is(
  (select estado from public.lookup_join_phone_state('TESTTOKEN', '+5491100000003')),
  'activar',
  'lookup: ficha sin cuenta → activar'
);

-- 5/6/7. Activar a la ficha sin cuenta (b3) vinculándola a la cuenta a3.
select activar_jugador_existente(
  'TESTTOKEN',
  '00000000-0000-0000-0000-0000000000b3',
  '00000000-0000-0000-0000-0000000000a3'
);

select is(
  (select auth_user_id from public.players where id = '00000000-0000-0000-0000-0000000000b3'),
  '00000000-0000-0000-0000-0000000000a3'::uuid,
  'activar: vincula la ficha a la cuenta'
);

select is(
  (select tipo::text from public.grupo_membresias
    where grupo_id = '00000000-0000-0000-0000-0000000000e1'
      and player_id = '00000000-0000-0000-0000-0000000000b3'
      and status = 'activo'),
  'titular',
  'activar: crea membresía activa (titular, hay cupo)'
);

select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000a3'),
  'player',
  'activar: profile queda con rol player'
);

-- 8. Defensa: ficha ya vinculada a OTRA cuenta → P0091.
select throws_ok(
  $$select public.activar_jugador_existente(
      'TESTTOKEN',
      '00000000-0000-0000-0000-0000000000b2',
      '00000000-0000-0000-0000-0000000000a3'
    )$$,
  'P0091',
  null,
  'activar: rechaza re-vincular una ficha ya ligada a otra cuenta'
);

select * from finish();
rollback;
