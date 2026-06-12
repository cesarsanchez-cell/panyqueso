-- ============================================================================
-- FUT-111: el coordinador ve los invitados de SUS convocatorias, no de otras
-- ============================================================================
--   1. El coordinador VE al invitado de una convocatoria que gestiona.
--   2. El coordinador NO ve al invitado de una convocatoria ajena.
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
   'admin-gr@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'coord-gr@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',       nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'coordinador', nombre = 'Coord' where id = '00000000-0000-0000-0000-0000000000a2';

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id, status) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6,
   '00000000-0000-0000-0000-0000000000a1', 'activo'),
  ('00000000-0000-0000-0000-0000000000e2', 'Grupo e2', '00000000-0000-0000-0000-00000000000a', 4, '21:00', 6,
   '00000000-0000-0000-0000-0000000000a1', 'activo');

-- a2 coordina e1 (no e2).
insert into public.coordinador_grupos (profile_id, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000a1');

insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date + 3, '20:00', 6, 'abierta',
   '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000c2', current_date + 4, '21:00', 6, 'abierta',
   '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1');

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

-- Como admin, sumamos un invitado a cada convocatoria.
select _as('00000000-0000-0000-0000-0000000000a1');
create temporary table _g on commit drop as
select
  (public.agregar_invitado_a_convocatoria('00000000-0000-0000-0000-0000000000c1', 'Invitado e1', 6)
     ->> 'player_id')::uuid as pid_e1,
  (public.agregar_invitado_a_convocatoria('00000000-0000-0000-0000-0000000000c2', 'Invitado e2', 6)
     ->> 'player_id')::uuid as pid_e2;

select plan(2);

-- Ahora como el coordinador de e1.
select _as('00000000-0000-0000-0000-0000000000a2');

select is(
  (select count(*)::int from public.players where id = (select pid_e1 from _g)),
  1,
  'el coordinador ve al invitado de su convocatoria'
);

select is(
  (select count(*)::int from public.players where id = (select pid_e2 from _g)),
  0,
  'el coordinador NO ve al invitado de una convocatoria ajena'
);

select * from finish();
rollback;
