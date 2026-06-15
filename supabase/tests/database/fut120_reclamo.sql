-- ============================================================================
-- FUT-120 (Fase 13 / F2): auto-reclamo del teléfono ya existente
-- ============================================================================
--   1. solicitar_reclamo_por_link con un teléfono existente → 'creado'.
--   2. queda una solicitud pendiente con kind='reclamo'.
--   3. listar_join_requests (admin) la muestra con kind='reclamo' y sin login.
--   4. pedir el reclamo de nuevo → 'ya_pendiente'.
--   5. aprobar → el jugador queda con membresía activa.
--   6. pedir el reclamo tras aprobar → 'ya_miembro'.
--   7. reclamo de un teléfono inexistente → P0033.
--
-- Nota: grupo_join_requests tiene RLS deny-all; el id se pasa por GUC local.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000',
   'admin-rec@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin', nombre = 'Admin Rec' where id = '00000000-0000-0000-0000-0000000000b1';

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000b', 'Cancha Rec', '00000000-0000-0000-0000-0000000000b1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id, status, join_token) values
  ('00000000-0000-0000-0000-00000000bb01', 'Grupo Rec', '00000000-0000-0000-0000-00000000000b', 2, '20:00', 10,
   '00000000-0000-0000-0000-0000000000b1', 'activo', 'tok_reclamo_1234567890');

-- Jugador ya existente (creado a mano, sin login).
insert into public.players (id, nombre, edad, role_field, position_pref, technical, physical, mental, status, phone, created_by) values
  ('00000000-0000-0000-0000-0000000000bf', 'Ya Existo', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved',
   '+5491155559001', '00000000-0000-0000-0000-0000000000b1');

create or replace function _as(p_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select plan(7);

-- 1. reclamo creado
select is(
  public.solicitar_reclamo_por_link('tok_reclamo_1234567890', '+5491155559001'),
  'creado', 'solicitar_reclamo con teléfono existente devuelve creado');

-- 2. queda pendiente con kind reclamo
select is(
  (select kind from public.grupo_join_requests
    where grupo_id = '00000000-0000-0000-0000-00000000bb01'
      and player_id = '00000000-0000-0000-0000-0000000000bf' and status = 'pendiente'),
  'reclamo', 'la solicitud queda con kind=reclamo');

-- 3. listar (admin) la muestra con kind y sin login
select _as('00000000-0000-0000-0000-0000000000b1');
select is(
  (select kind || ':' || tiene_login::text
     from public.listar_join_requests('00000000-0000-0000-0000-00000000bb01') limit 1),
  'reclamo:false', 'listar muestra kind=reclamo y tiene_login=false');
reset role;

-- 4. pedir de nuevo → ya_pendiente
select is(
  public.solicitar_reclamo_por_link('tok_reclamo_1234567890', '+5491155559001'),
  'ya_pendiente', 'segundo reclamo devuelve ya_pendiente');

-- guardar el id del reclamo (superuser) para aprobar como admin
select set_config('test.rec',
  (select id::text from public.grupo_join_requests
    where grupo_id = '00000000-0000-0000-0000-00000000bb01'
      and player_id = '00000000-0000-0000-0000-0000000000bf' and status = 'pendiente'),
  true);

-- 5. aprobar → membresía activa
select _as('00000000-0000-0000-0000-0000000000b1');
select public.aprobar_join_request(current_setting('test.rec')::uuid);
reset role;

select is(
  (select status::text from public.grupo_membresias
    where grupo_id = '00000000-0000-0000-0000-00000000bb01'
      and player_id = '00000000-0000-0000-0000-0000000000bf'),
  'activo', 'tras aprobar el reclamo, hay membresía activa');

-- 6. pedir el reclamo tras aprobar → ya_miembro
select is(
  public.solicitar_reclamo_por_link('tok_reclamo_1234567890', '+5491155559001'),
  'ya_miembro', 'reclamo tras aprobar devuelve ya_miembro');

-- 7. reclamo de un teléfono inexistente → P0033
select throws_ok(
  $$ select public.solicitar_reclamo_por_link('tok_reclamo_1234567890', '+5491155550000') $$,
  'P0033', null, 'reclamo de un teléfono inexistente dispara P0033');

select * from finish();
rollback;
