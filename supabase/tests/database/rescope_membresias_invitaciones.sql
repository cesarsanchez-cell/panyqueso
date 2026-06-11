-- ============================================================================
-- FUT-107d: tests del rescopeo de grupo_membresias y player_invitations
-- ============================================================================
-- El coordinador opera SOLO su grupo:
--   1-3. grupo_membresias: admin ve todas; coordinador ve/crea solo la de su
--        grupo y recibe 42501 al insertar en otro.
--   4-8. player_invitations: idem (ver/crear su grupo, 42501 en otro).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

select plan(8);

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'admin-mi@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'coord-mi@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',       nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'coordinador', nombre = 'Coord' where id = '00000000-0000-0000-0000-0000000000a2';

insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved',
   '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b2', 'P2', 28, 'jugador_campo', 'delantero', 6, 6, 6, 'approved',
   '00000000-0000-0000-0000-0000000000a1');

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6,
   '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e2', 'Grupo e2', '00000000-0000-0000-0000-00000000000a', 4, '21:00', 6,
   '00000000-0000-0000-0000-0000000000a1');

-- a2 coordina e1 (no e2).
insert into public.coordinador_grupos (profile_id, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000a1');

-- b1 es titular en ambos grupos.
insert into public.grupo_membresias (grupo_id, player_id, tipo) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'titular'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b1', 'titular');

-- Una invitación pendiente en cada grupo.
insert into public.player_invitations (token, phone, grupo_id, created_by, expires_at) values
  ('tok-e1-0000000000001', '1130000001', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000a1', now() + interval '2 days'),
  ('tok-e2-0000000000002', '1130000002', '00000000-0000-0000-0000-0000000000e2',
   '00000000-0000-0000-0000-0000000000a1', now() + interval '2 days');

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

-- 1. admin ve las dos membresías.
select _as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from public.grupo_membresias),
  2,
  'admin ve todas las membresías'
);

-- 2. coordinador ve solo la de su grupo.
select _as('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from public.grupo_membresias),
  1,
  'coordinador ve solo las membresías de su grupo'
);

-- 3. coordinador crea membresía en su grupo, NO en otro.
select lives_ok(
  $$ insert into public.grupo_membresias (grupo_id, player_id, tipo)
     values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b2', 'titular') $$,
  'coordinador crea membresía en su grupo'
);
select throws_ok(
  $$ insert into public.grupo_membresias (grupo_id, player_id, tipo)
     values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b2', 'titular') $$,
  '42501',
  NULL,
  'coordinador NO puede crear membresía en un grupo ajeno'
);

-- 5. admin ve las dos invitaciones.
select _as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from public.player_invitations),
  2,
  'admin ve todas las invitaciones'
);

-- 6. coordinador ve solo la de su grupo.
select _as('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from public.player_invitations),
  1,
  'coordinador ve solo las invitaciones de su grupo'
);

-- 7-8. coordinador invita a su grupo, NO a otro.
select lives_ok(
  $$ insert into public.player_invitations (token, phone, grupo_id, created_by, expires_at)
     values ('tok-e1-new-000000003', '1130000003', '00000000-0000-0000-0000-0000000000e1',
       '00000000-0000-0000-0000-0000000000a2', now() + interval '2 days') $$,
  'coordinador invita a su grupo'
);
select throws_ok(
  $$ insert into public.player_invitations (token, phone, grupo_id, created_by, expires_at)
     values ('tok-e2-new-000000004', '1130000004', '00000000-0000-0000-0000-0000000000e2',
       '00000000-0000-0000-0000-0000000000a2', now() + interval '2 days') $$,
  '42501',
  NULL,
  'coordinador NO puede invitar a un grupo ajeno'
);

select * from finish();
rollback;
