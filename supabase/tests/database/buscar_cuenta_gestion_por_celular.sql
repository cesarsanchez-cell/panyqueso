-- ============================================================================
-- Test: buscar_cuenta_gestion_por_celular (lookup de cuenta de gestión por cel)
-- ============================================================================
--   Setup: dos auth.users con email sintético <cel>@phone.fdlm.local
--     a2 = veedor sin ficha de jugador
--     a3 = player con ficha (auth_user_id vinculado)
--   1. admin: el celular de a2 → rol veedor.
--   2. admin: el celular de a2 → tiene_ficha = false (cuenta de gestión pura).
--   3. admin: el celular de a3 → tiene_ficha = true (cuenta con ficha de jugador).
--   4. player: llamar la función → not_authorized (P0013).
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
   'admin-bc@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   '1130000002@phone.fdlm.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000000',
   '1130000003@phone.fdlm.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-000000000000',
   'player-bc@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'veedor', nombre = 'Vee'   where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set role = 'player', nombre = 'Pla'   where id = '00000000-0000-0000-0000-0000000000a3';
update public.profiles set role = 'player', nombre = 'Pla4'  where id = '00000000-0000-0000-0000-0000000000a4';

-- a3 tiene ficha de jugador vinculada a su cuenta.
insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, auth_user_id, phone
) values
  ('00000000-0000-0000-0000-0000000000b3', 'Pedro', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved',
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', '1130000003');

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

-- 1. admin busca el celular de a2 (veedor sin ficha).
select _as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select rol::text from public.buscar_cuenta_gestion_por_celular('1130000002')),
  'veedor',
  'encuentra la cuenta de gestión y devuelve su rol');

select is(
  (select tiene_ficha from public.buscar_cuenta_gestion_por_celular('1130000002')),
  false,
  'la cuenta de gestión no tiene ficha de jugador');

-- 2. admin busca el celular de a3 (player con ficha).
select is(
  (select tiene_ficha from public.buscar_cuenta_gestion_por_celular('1130000003')),
  true,
  'el celular de un jugador devuelve tiene_ficha = true');

reset role;

-- 4. un player no puede usar la función.
select _as('00000000-0000-0000-0000-0000000000a4');
select throws_ok(
  $$select public.buscar_cuenta_gestion_por_celular('1130000002')$$,
  'P0013',
  null,
  'un player no está autorizado a buscar cuentas de gestión');
reset role;

select * from finish();
rollback;
