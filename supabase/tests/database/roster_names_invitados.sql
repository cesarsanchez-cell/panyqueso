-- ============================================================================
-- Tests: get_convocatoria_roster_names (los invitados NO pierden el nombre)
-- ============================================================================
--   1. Un participante ve el nombre del INVITADO (is_guest) del roster.
--   2. Un participante se ve a sí mismo en el roster.
--   3. Un ajeno (no participa ni gestiona) no recibe nada.
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
   'admin-rn@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'p1-rn@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000000',
   'out-rn@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'player', nombre = 'P1'    where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set role = 'player', nombre = 'Out'   where id = '00000000-0000-0000-0000-0000000000a3';

-- P1 (participa) + Invitado (is_guest, sin auth) + Ajeno.
insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, auth_user_id, is_guest
) values
  ('00000000-0000-0000-0000-0000000000b1', 'Pedro',    30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', false),
  ('00000000-0000-0000-0000-0000000000b9', 'Invitado', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', null,                                   true),
  ('00000000-0000-0000-0000-0000000000b3', 'Ajeno',    30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', false);

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6, '00000000-0000-0000-0000-0000000000a1');

insert into public.grupo_membresias (grupo_id, player_id, tipo, orden, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'titular', null, 'activo');

insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date + 3, '20:00', 6, 'abierta', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1');

-- Roster: Pedro (titular) + Invitado (titular). Ambos con player_id.
insert into public.convocatoria_players (convocatoria_id, player_id, nombre_libre, rol_en_convocatoria, attendance_status) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', null, 'titular', 'confirmado'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b9', null, 'titular', 'confirmado');

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

-- 1. Pedro (participa) ve el nombre del invitado.
select _as('00000000-0000-0000-0000-0000000000a2');
select is(
  (select nombre from public.get_convocatoria_roster_names(array['00000000-0000-0000-0000-0000000000c1']::uuid[])
    where player_id = '00000000-0000-0000-0000-0000000000b9'),
  'Invitado',
  'participante ve el nombre del invitado (is_guest)'
);

-- 2. Pedro se ve a sí mismo.
select is(
  (select nombre from public.get_convocatoria_roster_names(array['00000000-0000-0000-0000-0000000000c1']::uuid[])
    where player_id = '00000000-0000-0000-0000-0000000000b1'),
  'Pedro',
  'participante se ve a sí mismo'
);
reset role;

-- 3. Un ajeno no recibe nada de esa convocatoria.
select _as('00000000-0000-0000-0000-0000000000a3');
select is(
  (select count(*)::int from public.get_convocatoria_roster_names(array['00000000-0000-0000-0000-0000000000c1']::uuid[])),
  0,
  'ajeno (no participa ni gestiona) no ve el roster'
);
reset role;

select * from finish();
rollback;
