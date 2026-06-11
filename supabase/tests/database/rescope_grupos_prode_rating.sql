-- ============================================================================
-- FUT-107e: tests del rescopeo de grupos + rating x grupo + prode
-- ============================================================================
-- El coordinador opera SOLO su grupo:
--   1-2.  grupos SELECT: admin ve todos; coordinador ve solo el suyo.
--   3-4.  grupos UPDATE (premio_pinocho): 1 fila en el suyo, 0 en el ajeno.
--   5-6.  set_grupo_requiere_veedor: ok en el suyo, P0013 en el ajeno.
--   7-8.  get_group_rating: ve el rating de su grupo, vacío en el ajeno.
--   9-10. propose_group_rating_change: ok en el suyo, P0013 en el ajeno.
--   11.   admin_reset_prode: P0001 en el ajeno.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

select plan(11);

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'admin-gp@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'coord-gp@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',       nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'coordinador', nombre = 'Coord' where id = '00000000-0000-0000-0000-0000000000a2';

insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved',
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

-- b1 miembro de ambos grupos → el trigger siembra player_group_ratings en ambos.
insert into public.grupo_membresias (grupo_id, player_id, tipo) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'titular'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b1', 'titular');

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

-- 1. admin ve los dos grupos.
select _as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from public.grupos),
  2,
  'admin ve todos los grupos'
);

-- 2. coordinador ve solo el suyo.
select _as('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from public.grupos),
  1,
  'coordinador ve solo su grupo'
);

-- 3-4. UPDATE grupos (premio_pinocho): efectivo en el suyo, no en el ajeno.
--   (Un UPDATE filtrado por RLS USING afecta 0 filas, no lanza 42501; por eso
--   se verifica el EFECTO leyendo como admin, no por excepción ni CTE.)
update public.grupos set premio_pinocho = true where id = '00000000-0000-0000-0000-0000000000e1';
update public.grupos set premio_pinocho = true where id = '00000000-0000-0000-0000-0000000000e2';

select _as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select premio_pinocho::int from public.grupos where id = '00000000-0000-0000-0000-0000000000e1'),
  1,
  'coordinador actualiza la config de su grupo'
);
select is(
  (select premio_pinocho::int from public.grupos where id = '00000000-0000-0000-0000-0000000000e2'),
  0,
  'coordinador NO actualiza la config de un grupo ajeno'
);

-- Volvemos al coordinador para el resto.
select _as('00000000-0000-0000-0000-0000000000a2');

-- 5-6. set_grupo_requiere_veedor: ok en el suyo, P0013 en el ajeno.
select lives_ok(
  $$ select public.set_grupo_requiere_veedor('00000000-0000-0000-0000-0000000000e1', true) $$,
  'coordinador activa el gate del veedor de su grupo'
);
select throws_ok(
  $$ select public.set_grupo_requiere_veedor('00000000-0000-0000-0000-0000000000e2', true) $$,
  'P0013',
  NULL,
  'coordinador NO toca el gate del veedor de un grupo ajeno'
);

-- 7-8. get_group_rating: ve el de su grupo, vacío en el ajeno.
select is(
  (select count(*)::int from public.get_group_rating(
     '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e1')),
  1,
  'coordinador ve el rating de su grupo'
);
select is(
  (select count(*)::int from public.get_group_rating(
     '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e2')),
  0,
  'coordinador NO ve el rating de un grupo ajeno'
);

-- 9-10. propose_group_rating_change: ok en el suyo, P0013 en el ajeno.
select lives_ok(
  $$ select public.propose_group_rating_change(
       '00000000-0000-0000-0000-0000000000b1',
       '00000000-0000-0000-0000-0000000000e1',
       '{"phys_power": 7}'::jsonb,
       'ajuste de prueba') $$,
  'coordinador propone rating en su grupo'
);
select throws_ok(
  $$ select public.propose_group_rating_change(
       '00000000-0000-0000-0000-0000000000b1',
       '00000000-0000-0000-0000-0000000000e2',
       '{"phys_power": 7}'::jsonb,
       'ajuste de prueba') $$,
  'P0013',
  NULL,
  'coordinador NO propone rating en un grupo ajeno'
);

-- 11. admin_reset_prode: P0001 (forbidden) en el ajeno.
select throws_ok(
  format($$ select public.admin_reset_prode('00000000-0000-0000-0000-0000000000e2', %s) $$,
         extract(year from current_date)::int),
  'P0001',
  NULL,
  'coordinador NO resetea el prode de un grupo ajeno'
);

select * from finish();
rollback;
