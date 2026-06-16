-- ============================================================================
-- FUT-123 (Fase B): el admin otorga/quita el rango de veedor desde la app
-- ============================================================================
--   1. set_veedor(cand, true) (admin) → el perfil queda role='veedor'.
--   2. listar_perfiles_para_veedor muestra a cand con es_veedor=true.
--   3. set_veedor(cand, false) → vuelve a 'player' (tiene ficha).
--   4. set_veedor a un coordinador (true) → P0093.
--   5. set_veedor a un admin → P0092.
--   6. set_veedor a uno mismo → P0091.
--   7. set_veedor como NO admin → P0013.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000',
   'admin-vee@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000',
   'cand-vee@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-000000000000',
   'coord-vee@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-000000000000',
   'admin2-vee@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',       nombre = 'Admin Vee'  where id = '00000000-0000-0000-0000-0000000000d1';
update public.profiles set role = 'player',      nombre = 'Cand Vee'   where id = '00000000-0000-0000-0000-0000000000d2';
update public.profiles set role = 'coordinador', nombre = 'Coord Vee'  where id = '00000000-0000-0000-0000-0000000000d3';
update public.profiles set role = 'admin',       nombre = 'Admin2 Vee' where id = '00000000-0000-0000-0000-0000000000d4';

-- El candidato tiene ficha de jugador (para que al quitar veedor vuelva a player).
insert into public.players (id, nombre, edad, role_field, position_pref, technical, physical, mental, status, phone, auth_user_id, created_by) values
  ('00000000-0000-0000-0000-0000000000df', 'Cand Vee', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved',
   '+5491155557001', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1');

create or replace function _as(p_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select plan(7);

-- 1. otorgar veedor (admin)
select _as('00000000-0000-0000-0000-0000000000d1');
select public.set_veedor('00000000-0000-0000-0000-0000000000d2', true);
reset role;
select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000d2'),
  'veedor', 'set_veedor(true) otorga el rango veedor');

-- 2. listar lo muestra con es_veedor=true
select _as('00000000-0000-0000-0000-0000000000d1');
select is(
  (select es_veedor from public.listar_perfiles_para_veedor()
    where profile_id = '00000000-0000-0000-0000-0000000000d2'),
  true, 'listar_perfiles_para_veedor muestra es_veedor=true');
reset role;

-- 3. quitar veedor → vuelve a player (tiene ficha)
select _as('00000000-0000-0000-0000-0000000000d1');
select public.set_veedor('00000000-0000-0000-0000-0000000000d2', false);
reset role;
select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000d2'),
  'player', 'set_veedor(false) devuelve a player');

-- 4. otorgar veedor a un coordinador → P0093
select _as('00000000-0000-0000-0000-0000000000d1');
select throws_ok(
  $$ select public.set_veedor('00000000-0000-0000-0000-0000000000d3', true) $$,
  'P0093', null, 'veedor a un coordinador dispara P0093');
reset role;

-- 5. tocar a un admin → P0092
select _as('00000000-0000-0000-0000-0000000000d1');
select throws_ok(
  $$ select public.set_veedor('00000000-0000-0000-0000-0000000000d4', true) $$,
  'P0092', null, 'tocar el rango de un admin dispara P0092');
reset role;

-- 6. a uno mismo → P0091
select _as('00000000-0000-0000-0000-0000000000d1');
select throws_ok(
  $$ select public.set_veedor('00000000-0000-0000-0000-0000000000d1', true) $$,
  'P0091', null, 'cambiarse a uno mismo dispara P0091');
reset role;

-- 7. como NO admin → P0013
select _as('00000000-0000-0000-0000-0000000000d2');
select throws_ok(
  $$ select public.set_veedor('00000000-0000-0000-0000-0000000000d2', true) $$,
  'P0013', null, 'set_veedor como no-admin dispara P0013');
reset role;

select * from finish();
rollback;
