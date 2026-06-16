-- ============================================================================
-- FUT-125 (Fase 2): la auditoría por grupo
-- ============================================================================
--   1. grupo_requiere_veedor(grupo con veedor) = true.
--   2. grupo_requiere_veedor(grupo sin veedor) = false.
--   3. requiere_veedor() (global) = false (deprecado).
--   4. is_veedor_de_grupo(su grupo) = true.
--   5. is_veedor_de_grupo(otro grupo) = false.
--   6. approve de un request de OTRO grupo → P0003.
--   7. approve por alguien que no es veedor del grupo → P0003.
--   8. RLS: el veedor ve el request de SU grupo y no el de otro.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000000',
   'admin-aud@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-000000000000',
   'veedor-aud@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-000000000000',
   'rando-aud@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin Aud'  where id = '00000000-0000-0000-0000-0000000000f1';
update public.profiles set role = 'veedor', nombre = 'Veedor Aud' where id = '00000000-0000-0000-0000-0000000000f2';
update public.profiles set role = 'player', nombre = 'Rando Aud'  where id = '00000000-0000-0000-0000-0000000000f4';

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000f', 'Cancha Aud', '00000000-0000-0000-0000-0000000000f1');

-- Grupo A (con veedor) y Grupo B (sin veedor).
insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id, status) values
  ('00000000-0000-0000-0000-0000000000fa', 'Grupo A', '00000000-0000-0000-0000-00000000000f', 2, '20:00', 10,
   '00000000-0000-0000-0000-0000000000f1', 'activo'),
  ('00000000-0000-0000-0000-0000000000fb', 'Grupo B', '00000000-0000-0000-0000-00000000000f', 3, '20:00', 10,
   '00000000-0000-0000-0000-0000000000f1', 'activo');

-- El veedor está asignado solo al Grupo A.
insert into public.veedor_grupos (profile_id, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000f1');

-- Un jugador para colgarle los requests.
insert into public.players (id, nombre, edad, role_field, position_pref, technical, physical, mental, status, phone, created_by) values
  ('00000000-0000-0000-0000-0000000000fp', 'Pepe Aud', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved',
   '+5491155554001', '00000000-0000-0000-0000-0000000000f1');

-- Requests pendientes: uno del Grupo A, otro del Grupo B (requested_by admin).
-- Sin sesión (auth.uid() null) el trigger normalize respeta requested_by.
insert into public.player_change_requests (id, player_id, grupo_id, action_type, requested_by, proposed_values, reason, status) values
  ('00000000-0000-0000-0000-00000000fa01', '00000000-0000-0000-0000-0000000000fp',
   '00000000-0000-0000-0000-0000000000fa', 'update_sensitive_fields',
   '00000000-0000-0000-0000-0000000000f1', '{"technical": 7}'::jsonb, 'test A', 'pending'),
  ('00000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-0000000000fp',
   '00000000-0000-0000-0000-0000000000fb', 'update_sensitive_fields',
   '00000000-0000-0000-0000-0000000000f1', '{"technical": 8}'::jsonb, 'test B', 'pending');

create or replace function _as(p_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select plan(9);

-- 1/2. grupo_requiere_veedor = "el grupo tiene veedor"
select is(public.grupo_requiere_veedor('00000000-0000-0000-0000-0000000000fa'),
  true, 'grupo_requiere_veedor true en el grupo con veedor');
select is(public.grupo_requiere_veedor('00000000-0000-0000-0000-0000000000fb'),
  false, 'grupo_requiere_veedor false en el grupo sin veedor');

-- 3. requiere_veedor() global deprecado
select is(public.requiere_veedor(), false, 'requiere_veedor() global devuelve false');

-- 4/5. is_veedor_de_grupo segun el grupo
select _as('00000000-0000-0000-0000-0000000000f2');
select is(public.is_veedor_de_grupo('00000000-0000-0000-0000-0000000000fa'),
  true, 'el veedor es veedor de su grupo');
select is(public.is_veedor_de_grupo('00000000-0000-0000-0000-0000000000fb'),
  false, 'el veedor NO es veedor de un grupo ajeno');

-- 6. approve de un request de OTRO grupo → P0003
select throws_ok(
  $$ select public.approve_player_change_request('00000000-0000-0000-0000-00000000fb01') $$,
  'P0003', null, 'el veedor no puede aprobar un request de otro grupo');
reset role;

-- 7. approve por un no-veedor del grupo → P0003
select _as('00000000-0000-0000-0000-0000000000f4');
select throws_ok(
  $$ select public.approve_player_change_request('00000000-0000-0000-0000-00000000fa01') $$,
  'P0003', null, 'un no-veedor no puede aprobar');
reset role;

-- 8. RLS: el veedor ve el request de su grupo, no el de otro
select _as('00000000-0000-0000-0000-0000000000f2');
select is(
  (select count(*) from public.player_change_requests where grupo_id = '00000000-0000-0000-0000-0000000000fa'),
  1::bigint, 'el veedor ve el request de su grupo');
select is(
  (select count(*) from public.player_change_requests where grupo_id = '00000000-0000-0000-0000-0000000000fb'),
  0::bigint, 'el veedor NO ve el request de un grupo ajeno');
reset role;

select * from finish();
rollback;
