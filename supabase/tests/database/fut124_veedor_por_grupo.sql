-- ============================================================================
-- FUT-124 (Fase 1): el veedor por grupo (asignar/quitar + can_audit_grupo)
-- ============================================================================
--   1. asignar_veedor_a_grupo (lo hace el COORDINADOR del grupo) → role='veedor'.
--   2. queda la fila en veedor_grupos.
--   3. can_audit_grupo(su grupo) = true.
--   4. can_audit_grupo(otro grupo) = false.
--   5. asignar a un admin → P0090 (rango excluyente).
--   6. asignar sin gestionar el grupo → P0013.
--   7. quitar de su único grupo → vuelve a 'player'.
--   8. tras quitar, no quedan filas en veedor_grupos.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000',
   'admin-vg@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000000',
   'coord-vg@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-000000000000',
   'cand-vg@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-000000000000',
   'rando-vg@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',       nombre = 'Admin VG' where id = '00000000-0000-0000-0000-0000000000e1';
update public.profiles set role = 'coordinador', nombre = 'Coord VG' where id = '00000000-0000-0000-0000-0000000000e2';
update public.profiles set role = 'player',      nombre = 'Cand VG'  where id = '00000000-0000-0000-0000-0000000000e3';
update public.profiles set role = 'player',      nombre = 'Rando VG' where id = '00000000-0000-0000-0000-0000000000e4';

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000e', 'Cancha VG', '00000000-0000-0000-0000-0000000000e1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id, status) values
  ('00000000-0000-0000-0000-0000000000e9', 'Grupo VG',  '00000000-0000-0000-0000-00000000000e', 2, '20:00', 10,
   '00000000-0000-0000-0000-0000000000e1', 'activo'),
  ('00000000-0000-0000-0000-0000000000ea', 'Grupo VG2', '00000000-0000-0000-0000-00000000000e', 3, '20:00', 10,
   '00000000-0000-0000-0000-0000000000e1', 'activo');

-- El coordinador gestiona el Grupo VG.
insert into public.coordinador_grupos (profile_id, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000e1');

-- El candidato tiene ficha (para que al bajar la marca vuelva a player).
insert into public.players (id, nombre, edad, role_field, position_pref, technical, physical, mental, status, phone, auth_user_id, created_by) values
  ('00000000-0000-0000-0000-0000000000ef', 'Cand VG', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved',
   '+5491155556001', '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e1');

create or replace function _as(p_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select plan(8);

-- 1. el COORDINADOR del grupo asigna al candidato → marca veedor
select _as('00000000-0000-0000-0000-0000000000e2');
select public.asignar_veedor_a_grupo(
  '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e9');
reset role;
select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000e3'),
  'veedor', 'el coordinador puede asignar un veedor (otorga la marca)');

-- 2. queda la vinculación
select is(
  (select count(*) from public.veedor_grupos
    where profile_id = '00000000-0000-0000-0000-0000000000e3'
      and grupo_id = '00000000-0000-0000-0000-0000000000e9'),
  1::bigint, 'queda la fila en veedor_grupos');

-- 3. can_audit_grupo de su grupo = true
select _as('00000000-0000-0000-0000-0000000000e3');
select is(
  public.can_audit_grupo('00000000-0000-0000-0000-0000000000e9'),
  true, 'el veedor puede auditar su grupo');
-- 4. y de otro grupo = false
select is(
  public.can_audit_grupo('00000000-0000-0000-0000-0000000000ea'),
  false, 'el veedor NO puede auditar un grupo que no es suyo');
reset role;

-- 5. asignar a un admin → P0090
select _as('00000000-0000-0000-0000-0000000000e1');
select throws_ok(
  $$ select public.asignar_veedor_a_grupo(
       '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e9') $$,
  'P0090', null, 'asignar veedor a un admin dispara P0090');
reset role;

-- 6. asignar sin gestionar el grupo → P0013
select _as('00000000-0000-0000-0000-0000000000e4');
select throws_ok(
  $$ select public.asignar_veedor_a_grupo(
       '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e9') $$,
  'P0013', null, 'asignar sin gestionar el grupo dispara P0013');
reset role;

-- guardar el id de la vinculación (superuser) para quitar
select set_config('test.vg',
  (select id::text from public.veedor_grupos
    where profile_id = '00000000-0000-0000-0000-0000000000e3'
      and grupo_id = '00000000-0000-0000-0000-0000000000e9'),
  true);

-- 7. quitar de su único grupo → vuelve a player
select _as('00000000-0000-0000-0000-0000000000e2');
select public.quitar_veedor_de_grupo(current_setting('test.vg')::uuid);
reset role;
select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000e3'),
  'player', 'al quitar su último grupo el veedor vuelve a player');

-- 8. no quedan vinculaciones
select is(
  (select count(*) from public.veedor_grupos
    where profile_id = '00000000-0000-0000-0000-0000000000e3'),
  0::bigint, 'no quedan filas en veedor_grupos');

select * from finish();
rollback;
