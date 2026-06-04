-- ============================================================================
-- FUT-89 (Fase 2 · DB): club_id en lectura/escritura self-service
-- ============================================================================
--
-- Cubre:
--   1. El jugador setea su club_id vía update_my_player_data.
--   2. get_my_player_full devuelve el club_id seteado (prefill /perfil).
--   3. get_my_player_summary devuelve el club_id (escudo propio en /mi-perfil).
--   4. players_public expone club_id de un compañero de grupo.
--   5. club_id vacío ('') se guarda como NULL (= ninguno).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000',
   'admin-clubui@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000',
   'p1-clubui@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000',
   'p2-clubui@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set role = 'player', nombre = 'P1'    where id = '00000000-0000-0000-0000-0000000000c2';
update public.profiles set role = 'player', nombre = 'P2'    where id = '00000000-0000-0000-0000-0000000000c3';

insert into public.players (
  id, nombre, edad, fecha_nacimiento, role_field, position_pref,
  technical, physical, mental, status, created_by, auth_user_id
) values
  ('00000000-0000-0000-0000-0000000000d1', 'P1', 30, '1996-01-01', 'jugador_campo', 'delantero',
   6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2'),
  ('00000000-0000-0000-0000-0000000000d2', 'P2', 28, '1998-01-01', 'jugador_campo', 'defensor',
   5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c3');

-- Mismo grupo: P1 y P2 son compañeros activos (para players_public).
insert into public.grupos (id, nombre, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo', 2, '20:00', 6, '00000000-0000-0000-0000-0000000000c1');
insert into public.grupo_membresias (grupo_id, player_id, tipo, orden, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', 'titular', null, 'activo'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d2', 'titular', null, 'activo');

-- P2 ya tiene club seteado directo (simula self-signup que lo persiste).
update public.players set club_id = 'river' where id = '00000000-0000-0000-0000-0000000000d2';

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select plan(5);

-- 1. P1 setea su club vía update_my_player_data.
select _as('00000000-0000-0000-0000-0000000000c2');
select lives_ok(
  $$select public.update_my_player_data(
      'P1', null, '1996-01-01'::date, null, null,
      'jugador_campo'::public.player_role_field, 'delantero'::public.position_pref,
      '{}'::public.position_pref[], null, 'boca')$$,
  'update_my_player_data acepta club_id'
);

-- 2. get_my_player_full devuelve el club seteado.
select is(
  (select club_id from public.get_my_player_full()),
  'boca',
  'get_my_player_full devuelve club_id'
);

-- 3. get_my_player_summary devuelve el club.
select is(
  (select club_id from public.get_my_player_summary()),
  'boca',
  'get_my_player_summary devuelve club_id'
);

-- 4. players_public expone el club del compañero P2.
select is(
  (select club_id from public.players_public where id = '00000000-0000-0000-0000-0000000000d2'),
  'river',
  'players_public expone club_id del compañero'
);

-- 5. club_id vacío se guarda como NULL.
select _as('00000000-0000-0000-0000-0000000000c2');
select public.update_my_player_data(
  'P1', null, '1996-01-01'::date, null, null,
  'jugador_campo'::public.player_role_field, 'delantero'::public.position_pref,
  '{}'::public.position_pref[], null, '');
select is(
  (select club_id from public.get_my_player_full()),
  null,
  'club_id vacío se guarda como NULL'
);

select * from finish();
rollback;
