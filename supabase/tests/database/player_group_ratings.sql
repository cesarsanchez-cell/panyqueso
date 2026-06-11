-- ============================================================================
-- FUT-103: tests de player_group_ratings (ratings por grupo, scoring v2)
-- ============================================================================
-- Cubre:
--   1. Al agregar una membresía se auto-crea la fila de rating (copiada de la base).
--   2. internal_score = compute_internal_score_v2 (físico_ef×0.35 + mental×0.325 + técnica×0.325).
--   3. Editar los subs recalcula dimensión derivada + score, y NO toca la base de players.
--   4. on conflict do nothing: re-ingresar al grupo conserva el rating afinado (no resetea).
--   5. Cambiar players.edad recalcula el score de todas las filas del jugador.
--   6. RLS: el player NO ve la tabla; el admin sí.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

select plan(8);

-- Setup: admin (a1) + un player con auth (a2, ligado al player b1 para RLS).
insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'admin-pgr@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'p1-pgr@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'player', nombre = 'P1'    where id = '00000000-0000-0000-0000-0000000000a2';

-- b1: base technical 8, physical 6, mental 7, edad 30. Subs null -> el seed los
-- coalesce a la dimensión (phys=6, ment=7, tech=8).
insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, auth_user_id
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'jugador_campo', 'mediocampista', 8, 6, 7, 'approved',
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2');

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6,
   '00000000-0000-0000-0000-0000000000a1');

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

-- 1. Agregar la membresía -> el trigger auto-crea la fila de rating.
insert into public.grupo_membresias (grupo_id, player_id, tipo, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'titular', 'activo');

select is(
  (select count(*)::int from public.player_group_ratings
    where player_id = '00000000-0000-0000-0000-0000000000b1'
      and grupo_id  = '00000000-0000-0000-0000-0000000000e1'),
  1,
  'Agregar la membresía auto-crea 1 fila de rating del grupo'
);

-- 2. Score v2 con dims derivadas (físico 6, mental 7, técnica 8) y edad 30
-- (factor 1.00): 6*1.00*0.35 + 7*0.325 + 8*0.325 = 2.10 + 2.275 + 2.60 = 6.975 -> 6.98.
select is(
  (select internal_score from public.player_group_ratings
    where player_id = '00000000-0000-0000-0000-0000000000b1'
      and grupo_id  = '00000000-0000-0000-0000-0000000000e1'),
  6.98::numeric,
  'internal_score inicial = compute_internal_score_v2 sobre la base (6.98)'
);

-- 3. Editar los subs técnicos a 10 -> técnica derivada 10 ->
-- 6*0.35 + 7*0.325 + 10*0.325 = 2.10 + 2.275 + 3.25 = 7.625 -> 7.63.
update public.player_group_ratings
   set tech_passing = 10, tech_finishing = 10, tech_linkup = 10
  where player_id = '00000000-0000-0000-0000-0000000000b1'
    and grupo_id  = '00000000-0000-0000-0000-0000000000e1';

select is(
  (select internal_score from public.player_group_ratings
    where player_id = '00000000-0000-0000-0000-0000000000b1'
      and grupo_id  = '00000000-0000-0000-0000-0000000000e1'),
  7.63::numeric,
  'Editar los subs técnicos recalcula dim derivada + score (7.63)'
);

-- 4. La base de players NO se tocó (sigue en 8).
select is(
  (select technical from public.players where id = '00000000-0000-0000-0000-0000000000b1'),
  8,
  'Editar el rating del grupo no toca la base global del jugador'
);

-- 5. Re-ingresar al grupo conserva el rating afinado (on conflict do nothing).
update public.grupo_membresias set status = 'inactivo'
  where grupo_id = '00000000-0000-0000-0000-0000000000e1'
    and player_id = '00000000-0000-0000-0000-0000000000b1';
insert into public.grupo_membresias (grupo_id, player_id, tipo, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'titular', 'activo');

select is(
  (select tech_passing from public.player_group_ratings
    where player_id = '00000000-0000-0000-0000-0000000000b1'
      and grupo_id  = '00000000-0000-0000-0000-0000000000e1'),
  10,
  'Re-ingresar al grupo conserva el rating afinado (no resetea a la base)'
);

-- 6. Cambiar la edad (30 -> 56, factor 0.70) recalcula:
-- 6*0.70*0.35 + 7*0.325 + 10*0.325 = 1.47 + 2.275 + 3.25 = 6.995 -> 7.00.
update public.players set edad = 56 where id = '00000000-0000-0000-0000-0000000000b1';

select is(
  (select internal_score from public.player_group_ratings
    where player_id = '00000000-0000-0000-0000-0000000000b1'
      and grupo_id  = '00000000-0000-0000-0000-0000000000e1'),
  7.00::numeric,
  'Cambiar players.edad recalcula el score del grupo (7.00)'
);

-- 7. RLS: el player no ve la tabla.
select _as('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from public.player_group_ratings),
  0,
  'RLS: el player no ve player_group_ratings'
);

-- 8. RLS: el admin sí la ve.
select _as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from public.player_group_ratings),
  1,
  'RLS: el admin ve player_group_ratings'
);

select * from finish();
rollback;
