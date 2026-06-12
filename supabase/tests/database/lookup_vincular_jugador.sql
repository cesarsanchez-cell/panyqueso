-- ============================================================================
-- FUT-110: alta en dos pasos — lookup_jugador_por_celular + vincular_jugador_a_grupo
-- ============================================================================
--   1. lookup de un celular EXISTENTE -> exists=true, nombre correcto, no miembro.
--   2. lookup de un celular INEXISTENTE -> exists=false.
--   3. lookup en grupo ajeno -> not_authorized (P0013).
--   4. vincular el existente -> queda miembro activo del grupo.
--   5. vincular hereda el rating del grupo más reciente (phys_power = 9).
--   6. lookup tras vincular -> already_member = true.
--   7. re-vincular al ya-miembro -> already_member (P0032).
--   8. vincular un celular inexistente -> player_not_found (P0033).
--   9. vincular en grupo ajeno -> not_authorized (P0013).
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
   'admin-lv@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'coord-lv@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',       nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'coordinador', nombre = 'Coord' where id = '00000000-0000-0000-0000-0000000000a2';

-- Jugador existente con celular, miembro de e2 (tiene rating afinado en e2).
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

select plan(9);

select _as('00000000-0000-0000-0000-0000000000a2');

-- 1. lookup de un celular existente.
select is(
  (select public.lookup_jugador_por_celular(
     '00000000-0000-0000-0000-0000000000e1', '+5491130000001')
   ->> 'nombre'),
  'Existente',
  'lookup: trae el nombre del jugador existente'
);

-- 2. lookup de un celular inexistente.
select is(
  (select public.lookup_jugador_por_celular(
     '00000000-0000-0000-0000-0000000000e1', '+5491139999999')
   ->> 'exists'),
  'false',
  'lookup: celular inexistente -> exists=false'
);

-- 3. lookup en grupo ajeno -> not_authorized.
select throws_ok(
  $$ select public.lookup_jugador_por_celular(
       '00000000-0000-0000-0000-0000000000e2', '+5491130000001') $$,
  'P0013',
  NULL,
  'lookup: en grupo ajeno dispara not_authorized'
);

-- 4. vincular el existente a e1.
select is(
  (select public.vincular_jugador_a_grupo(
     '00000000-0000-0000-0000-0000000000e1', '+5491130000001') ->> 'player_id'),
  '00000000-0000-0000-0000-0000000000b1',
  'vincular: devuelve el player_id del existente'
);

select is(
  (select count(*)::int from public.grupo_membresias
    where grupo_id = '00000000-0000-0000-0000-0000000000e1'
      and player_id = '00000000-0000-0000-0000-0000000000b1' and status = 'activo'),
  1,
  'vincular: el jugador queda miembro activo del grupo'
);

-- 5. El rating de e1 heredó de e2 (phys_power = 9, no la base 6).
select is(
  (select phys_power from public.player_group_ratings
    where player_id = '00000000-0000-0000-0000-0000000000b1'
      and grupo_id = '00000000-0000-0000-0000-0000000000e1'),
  9,
  'vincular: el rating del grupo nuevo hereda del grupo más reciente'
);

-- 6. lookup tras vincular -> already_member.
select is(
  (select public.lookup_jugador_por_celular(
     '00000000-0000-0000-0000-0000000000e1', '+5491130000001')
   ->> 'already_member'),
  'true',
  'lookup: tras vincular, already_member=true'
);

-- 7. re-vincular al ya-miembro -> already_member.
select throws_ok(
  $$ select public.vincular_jugador_a_grupo(
       '00000000-0000-0000-0000-0000000000e1', '+5491130000001') $$,
  'P0032',
  NULL,
  'vincular: re-vincular a un miembro activo dispara already_member'
);

-- 8. vincular un celular inexistente -> player_not_found.
select throws_ok(
  $$ select public.vincular_jugador_a_grupo(
       '00000000-0000-0000-0000-0000000000e1', '+5491139999999') $$,
  'P0033',
  NULL,
  'vincular: celular inexistente dispara player_not_found'
);

-- 9. vincular en grupo ajeno -> not_authorized.
select throws_ok(
  $$ select public.vincular_jugador_a_grupo(
       '00000000-0000-0000-0000-0000000000e2', '+5491130000001') $$,
  'P0013',
  NULL,
  'vincular: en grupo ajeno dispara not_authorized'
);

select * from finish();
rollback;
