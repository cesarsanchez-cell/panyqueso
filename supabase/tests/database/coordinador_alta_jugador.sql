-- ============================================================================
-- FUT-108 (2c-3b): alta group-first del coordinador (crear o vincular)
-- ============================================================================
--   1-3. Vincular un jugador existente a su grupo (linked=true), queda miembro
--        activo y HEREDA el rating del grupo más reciente.
--   4-5. Crear un jugador nuevo (linked=false): approved + miembro de su grupo.
--   6.   Reintentar con un jugador que ya es miembro -> already_member (P0032).
--   7.   Alta en un grupo ajeno -> not_authorized (P0013).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

select plan(7);

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'admin-al@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'coord-al@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',       nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'coordinador', nombre = 'Coord' where id = '00000000-0000-0000-0000-0000000000a2';

-- Jugador existente con celular, miembro de e2 (tiene rating en e2).
insert into public.players (
  id, nombre, edad, phone, role_field, position_pref, technical, physical, mental, status, created_by
) values
  ('00000000-0000-0000-0000-0000000000b1', 'Existente', 30, '+5491130000001',
   'jugador_campo', 'mediocampista', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1');

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id, status) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6,
   '00000000-0000-0000-0000-0000000000a1', 'activo'),
  ('00000000-0000-0000-0000-0000000000e2', 'Grupo e2', '00000000-0000-0000-0000-00000000000a', 4, '21:00', 6,
   '00000000-0000-0000-0000-0000000000a1', 'activo');

-- a2 coordina e1 (no e2).
insert into public.coordinador_grupos (profile_id, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000a1');

-- b1 miembro de e2 -> seed crea su rating en e2; lo afinamos (phys_power=9).
insert into public.grupo_membresias (grupo_id, player_id, tipo) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b1', 'titular');
update public.player_group_ratings set phys_power = 9
 where player_id = '00000000-0000-0000-0000-0000000000b1' and grupo_id = '00000000-0000-0000-0000-0000000000e2';

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select _as('00000000-0000-0000-0000-0000000000a2');

-- 1. Vincular el existente a e1 (linked = true).
select is(
  (select public.coordinador_alta_jugador(
     '00000000-0000-0000-0000-0000000000e1', 'Existente', '+5491130000001', 30) ->> 'linked'),
  'true',
  'vincula al jugador existente (no crea uno nuevo)'
);

-- 2. b1 quedó miembro activo de e1.
select is(
  (select count(*)::int from public.grupo_membresias
    where grupo_id = '00000000-0000-0000-0000-0000000000e1'
      and player_id = '00000000-0000-0000-0000-0000000000b1' and status = 'activo'),
  1,
  'el jugador vinculado queda miembro activo del grupo'
);

-- 3. El rating de e1 heredó de e2 (phys_power = 9, no la base 6).
select is(
  (select phys_power from public.player_group_ratings
    where player_id = '00000000-0000-0000-0000-0000000000b1'
      and grupo_id = '00000000-0000-0000-0000-0000000000e1'),
  9,
  'el rating del grupo nuevo hereda del grupo más reciente'
);

-- 4. Crear un jugador nuevo (linked = false).
select is(
  (select public.coordinador_alta_jugador(
     '00000000-0000-0000-0000-0000000000e1', 'Nuevo', '+5491130000002', 25) ->> 'linked'),
  'false',
  'crea un jugador nuevo cuando el celular no existe'
);

-- 5. El nuevo está approved y es miembro de e1.
select is(
  (select count(*)::int
     from public.players p
     join public.grupo_membresias gm on gm.player_id = p.id
    where p.phone = '+5491130000002' and p.status = 'approved'
      and gm.grupo_id = '00000000-0000-0000-0000-0000000000e1' and gm.status = 'activo'),
  1,
  'el jugador nuevo queda approved y miembro del grupo'
);

-- 6. Reintentar con un jugador que ya es miembro -> already_member.
select throws_ok(
  $$ select public.coordinador_alta_jugador(
       '00000000-0000-0000-0000-0000000000e1', 'Existente', '+5491130000001', 30) $$,
  'P0032',
  NULL,
  'no se puede dar de alta a alguien que ya es miembro del grupo'
);

-- 7. Alta en un grupo ajeno -> not_authorized.
select throws_ok(
  $$ select public.coordinador_alta_jugador(
       '00000000-0000-0000-0000-0000000000e2', 'X', '+5491130000003', 20) $$,
  'P0013',
  NULL,
  'el coordinador no puede dar de alta en un grupo ajeno'
);

select * from finish();
rollback;
