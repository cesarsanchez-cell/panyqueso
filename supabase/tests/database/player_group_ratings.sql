-- ============================================================================
-- FUT-103: tests de player_group_ratings (ratings por grupo)
-- ============================================================================
-- Cubre:
--   1. Al agregar una membresía se auto-crea la fila de rating (copiada de la base).
--   2. internal_score = misma fórmula que players (técnica·0.45 + físico·factor·0.30 + mental·0.25).
--   3. Editar el rating del grupo recalcula el score y NO toca la base de players.
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

-- b1: base technical 8, physical 6, mental 7, edad 30 (factor 1.00).
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

create or replace function _reset()
returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);
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

-- 2. Score = 8*0.45 + 6*1.00*0.30 + 7*0.25 = 3.60 + 1.80 + 1.75 = 7.15.
select is(
  (select internal_score from public.player_group_ratings
    where player_id = '00000000-0000-0000-0000-0000000000b1'
      and grupo_id  = '00000000-0000-0000-0000-0000000000e1'),
  7.15::numeric,
  'internal_score inicial = fórmula sobre la base (7.15)'
);

-- 3. Editar el rating del grupo (technical 8 -> 10) recalcula: 10*0.45 + 6*0.30 + 7*0.25 = 8.05.
update public.player_group_ratings set technical = 10
  where player_id = '00000000-0000-0000-0000-0000000000b1'
    and grupo_id  = '00000000-0000-0000-0000-0000000000e1';

select is(
  (select internal_score from public.player_group_ratings
    where player_id = '00000000-0000-0000-0000-0000000000b1'
      and grupo_id  = '00000000-0000-0000-0000-0000000000e1'),
  8.05::numeric,
  'Editar technical recalcula el score del grupo (8.05)'
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
  (select technical from public.player_group_ratings
    where player_id = '00000000-0000-0000-0000-0000000000b1'
      and grupo_id  = '00000000-0000-0000-0000-0000000000e1'),
  10,
  'Re-ingresar al grupo conserva el rating afinado (no resetea a la base)'
);

-- 6. Cambiar la edad (30 -> 56, factor 0.75) recalcula: 10*0.45 + 6*0.75*0.30 + 7*0.25 = 7.60.
update public.players set edad = 56 where id = '00000000-0000-0000-0000-0000000000b1';

select is(
  (select internal_score from public.player_group_ratings
    where player_id = '00000000-0000-0000-0000-0000000000b1'
      and grupo_id  = '00000000-0000-0000-0000-0000000000e1'),
  7.60::numeric,
  'Cambiar players.edad recalcula el score del grupo (7.60)'
);

-- 7. RLS: el player no ve la tabla.
select _as('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from public.player_group_ratings),
  0,
  'RLS: el player no ve player_group_ratings'
);
select _reset();

-- 8. RLS: el admin sí la ve.
select _as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from public.player_group_ratings),
  1,
  'RLS: el admin ve player_group_ratings'
);
select _reset();

select * from finish();
rollback;
