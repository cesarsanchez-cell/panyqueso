-- ============================================================================
-- Test: addable_players_for_grupo (candidatos del combo "Agregar miembro")
-- ============================================================================
-- El coordinador puede re-agregar a un EX-miembro de su grupo (membresía
-- inactivo), sin ver el padrón global. El admin ve todo el padrón approved.
--   Setup: a2 coordina e1 (no e2).
--     b1 = miembro ACTIVO de e1   → excluido (ya está en el grupo destino)
--     b2 = ex-miembro de e1 (INACTIVO) → candidato a re-agregar
--     b3 = miembro activo de e2 (que a2 no gestiona) → fuera del alcance coord
--   1. coord: addable(e1) incluye al ex-miembro b2.
--   2. coord: addable(e1) NO incluye al activo b1.
--   3. coord: addable(e1) NO incluye a b3 (otro grupo).
--   4. coord: addable(e1) son exactamente 1 (solo b2).
--   5. admin: addable(e1) incluye b2 y b3, excluye b1 → 2.
--   6. coord: addable(e2) (grupo que NO gestiona) → 0 (gate).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

select plan(6);

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'admin-ap@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'coord-ap@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',       nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'coordinador', nombre = 'Coord' where id = '00000000-0000-0000-0000-0000000000a2';

insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved',
   '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b2', 'P2', 28, 'jugador_campo', 'delantero', 6, 6, 6, 'approved',
   '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b3', 'P3', 25, 'jugador_campo', 'defensor', 6, 6, 6, 'approved',
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

-- b1 activo en e1; b2 ex-miembro (inactivo) de e1; b3 activo en e2.
insert into public.grupo_membresias (grupo_id, player_id, tipo, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'titular', 'activo'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b2', 'titular', 'inactivo'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b3', 'titular', 'activo');

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

-- 1-4. coordinador, grupo que gestiona (e1).
select _as('00000000-0000-0000-0000-0000000000a2');

select is(
  (select count(*)::int from public.addable_players_for_grupo('00000000-0000-0000-0000-0000000000e1')
    where id = '00000000-0000-0000-0000-0000000000b2'),
  1, 'coordinador ve al ex-miembro inactivo como candidato a re-agregar');

select is(
  (select count(*)::int from public.addable_players_for_grupo('00000000-0000-0000-0000-0000000000e1')
    where id = '00000000-0000-0000-0000-0000000000b1'),
  0, 'coordinador NO ve al miembro activo (ya está en el grupo)');

select is(
  (select count(*)::int from public.addable_players_for_grupo('00000000-0000-0000-0000-0000000000e1')
    where id = '00000000-0000-0000-0000-0000000000b3'),
  0, 'coordinador NO ve a un jugador de otro grupo que no gestiona');

select is(
  (select count(*)::int from public.addable_players_for_grupo('00000000-0000-0000-0000-0000000000e1')),
  1, 'coordinador: el único candidato para e1 es el ex-miembro');

-- 5. admin: padrón approved menos los activos del grupo destino.
select _as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from public.addable_players_for_grupo('00000000-0000-0000-0000-0000000000e1')),
  2, 'admin ve a b2 y b3 como candidatos (b1 activo excluido)');

-- 6. coordinador, grupo que NO gestiona (e2): gate → vacío.
select _as('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from public.addable_players_for_grupo('00000000-0000-0000-0000-0000000000e2')),
  0, 'coordinador no obtiene candidatos de un grupo que no gestiona');

select * from finish();
rollback;
