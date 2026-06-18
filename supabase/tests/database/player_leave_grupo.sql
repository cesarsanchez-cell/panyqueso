-- ============================================================================
-- Test: player_leave_grupo (el jugador se baja del grupo por su cuenta)
-- ============================================================================
--   1. El jugador miembro se baja → su membresía queda 'inactivo'.
--   2. Bajarse de nuevo (ya inactivo) → not_active_member (P0002).
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
   'admin-lg@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'p1-lg@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'player', nombre = 'P1'    where id = '00000000-0000-0000-0000-0000000000a2';

insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, auth_user_id
) values
  ('00000000-0000-0000-0000-0000000000b1', 'Pedro', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2');

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6, '00000000-0000-0000-0000-0000000000a1');

insert into public.grupo_membresias (grupo_id, player_id, tipo, orden, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'titular', null, 'activo');

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select plan(2);

-- 1. Pedro se baja del grupo → membresía inactivo.
select _as('00000000-0000-0000-0000-0000000000a2');
select public.player_leave_grupo('00000000-0000-0000-0000-0000000000e1');
reset role;

select is(
  (select status::text from public.grupo_membresias
    where grupo_id = '00000000-0000-0000-0000-0000000000e1'
      and player_id = '00000000-0000-0000-0000-0000000000b1'),
  'inactivo',
  'el jugador que se baja queda con membresía inactivo'
);

-- 2. Bajarse de nuevo → not_active_member.
select _as('00000000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$select public.player_leave_grupo('00000000-0000-0000-0000-0000000000e1')$$,
  'P0002',
  null,
  'bajarse de nuevo (ya inactivo) lanza not_active_member'
);
reset role;

select * from finish();
rollback;
