-- ============================================================================
-- Test: la vista de jugador se gatea por ficha, no por rol = 'player'
-- ============================================================================
-- Un coordinador que TAMBIÉN juega (rol 'coordinador', con ficha) y es miembro
-- de un grupo que NO gestiona debe poder leer ese grupo y su membresía en su
-- vista de jugador.
--   Setup: a2 = coordinador con ficha b2. Coordina e2 (por eso rol coordinador).
--          Es miembro-jugador de e1 (que NO gestiona). e3 = grupo ajeno.
--   1. a2 ve el grupo e1 (es miembro, aunque su rol sea coordinador).
--   2. a2 ve su membresía en e1.
--   3. a2 NO ve e3 (no es miembro ni lo gestiona).
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
   'admin-pf@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'coordjuega-pf@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',       nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'coordinador', nombre = 'CoordJuega' where id = '00000000-0000-0000-0000-0000000000a2';

-- a2 tiene ficha de jugador (juega además de coordinar).
insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, auth_user_id
) values
  ('00000000-0000-0000-0000-0000000000b2', 'Coco', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved',
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2');

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e2', 'Grupo e2', '00000000-0000-0000-0000-00000000000a', 4, '21:00', 6, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e3', 'Grupo e3', '00000000-0000-0000-0000-00000000000a', 5, '22:00', 6, '00000000-0000-0000-0000-0000000000a1');

-- a2 coordina e2 (de ahí su rol coordinador), pero NO e1.
insert into public.coordinador_grupos (profile_id, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1');

-- a2 (su ficha b2) es miembro-jugador de e1.
insert into public.grupo_membresias (grupo_id, player_id, tipo, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b2', 'titular', 'activo');

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select plan(3);

select _as('00000000-0000-0000-0000-0000000000a2');

-- 1. ve el grupo e1 (es miembro, aunque su rol sea coordinador y no lo gestione).
select is(
  (select count(*)::int from public.grupos where id = '00000000-0000-0000-0000-0000000000e1'),
  1, 'el coordinador que juega ve el grupo donde es miembro (aunque no lo gestione)');

-- 2. ve su membresía en e1.
select is(
  (select count(*)::int from public.grupo_membresias
    where grupo_id = '00000000-0000-0000-0000-0000000000e1'
      and player_id = '00000000-0000-0000-0000-0000000000b2'),
  1, 've su propia membresía en ese grupo');

-- 3. NO ve un grupo ajeno (e3: ni miembro ni lo gestiona).
select is(
  (select count(*)::int from public.grupos where id = '00000000-0000-0000-0000-0000000000e3'),
  0, 'no ve un grupo donde no es miembro ni lo gestiona');

reset role;

select * from finish();
rollback;
