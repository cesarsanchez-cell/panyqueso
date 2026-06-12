-- ============================================================================
-- FUT-113: el jugador ve las convocatorias de su grupo aunque no tenga fila
-- ============================================================================
--   1. Miembro activo del grupo SIN fila en convocatoria_players (caso "sacado")
--      puede SELECT la convocatoria abierta -> count 1.
--   2. Un jugador que NO es miembro del grupo no la ve -> count 0.
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
   'admin-113@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'p1-113@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000000',
   'p2-113@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'player', nombre = 'P1'    where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set role = 'player', nombre = 'P2'    where id = '00000000-0000-0000-0000-0000000000a3';

insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, auth_user_id
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved',
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000b2', 'P2', 28, 'jugador_campo', 'defensor', 5, 5, 5, 'approved',
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3');

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6,
   '00000000-0000-0000-0000-0000000000a1');

-- P1 es miembro ACTIVO del grupo, pero NO tiene fila en convocatoria_players
-- (simula que el coordinador lo sacó). P2 no es miembro de ningún grupo.
insert into public.grupo_membresias (grupo_id, player_id, tipo, orden, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'titular', null, 'activo');

insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date + 3, '20:00', 6, 'abierta',
   '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1');

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

-- 1. P1 (miembro del grupo, sin fila en la convocatoria) SÍ ve la convocatoria.
select _as('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from public.convocatorias
    where id = '00000000-0000-0000-0000-0000000000c1'),
  1,
  'un miembro del grupo sin fila en convocatoria_players ve la convocatoria abierta'
);

-- 2. P2 (no es miembro del grupo) NO la ve.
select _as('00000000-0000-0000-0000-0000000000a3');
select is(
  (select count(*)::int from public.convocatorias
    where id = '00000000-0000-0000-0000-0000000000c1'),
  0,
  'un jugador que no es miembro del grupo no ve la convocatoria'
);

select * from finish();
rollback;
