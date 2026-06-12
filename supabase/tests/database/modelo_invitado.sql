-- ============================================================================
-- FUT-111: invitado puntual como registro fantasma (agregar_invitado_a_convocatoria)
-- ============================================================================
--   1. El RPC devuelve rol 'titular' (hay cupo).
--   2. El jugador creado es is_guest = true.
--   3. internal_score = el puntaje exacto (7), por la edad neutra.
--   4. Queda en la convocatoria: player_id seteado, nombre_libre NULL, confirmado.
--   5. players_public NO lo incluye (invisible para el jugador).
--   6. Sin puntaje → default 6 (internal_score = 6).
--   7. Un coordinador que NO gestiona esa convocatoria → not_authorized (P0013).
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
   'admin-inv@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'coord-inv@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

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

select plan(7);

select _as('00000000-0000-0000-0000-0000000000a1');

-- Crear el invitado con puntaje 7 y capturar su player_id.
create temporary table _g on commit drop as
select (public.agregar_invitado_a_convocatoria(
          '00000000-0000-0000-0000-0000000000c1', 'Salvavidas', 7) ->> 'player_id')::uuid as pid;

-- 1. El registro queda marcado como invitado.
select is(
  (select is_guest from public.players where id = (select pid from _g)),
  true,
  'el invitado se crea con is_guest = true'
);

-- 2. Entra como titular (hay cupo) — lo leemos desde la convocatoria.
select is(
  (select rol_en_convocatoria::text from public.convocatoria_players
    where player_id = (select pid from _g)),
  'titular',
  'el invitado entra como titular (hay cupo)'
);

-- 3. internal_score = puntaje exacto (edad neutra → factor 1.0).
select cmp_ok(
  (select internal_score from public.players where id = (select pid from _g)),
  '=', 7::numeric,
  'internal_score = puntaje exacto (7)'
);

-- 4. En la convocatoria: nombre_libre NULL + confirmado.
select is(
  (select count(*)::int from public.convocatoria_players
    where player_id = (select pid from _g)
      and nombre_libre is null
      and attendance_status = 'confirmado'),
  1,
  'queda en la convocatoria con player_id, nombre_libre NULL y confirmado'
);

-- 5. players_public NO lo incluye (invisible para el jugador).
select is(
  (select count(*)::int from public.players_public where id = (select pid from _g)),
  0,
  'players_public excluye al invitado'
);

-- 6. Sin puntaje → default 6.
select cmp_ok(
  (select internal_score from public.players
    where id = (public.agregar_invitado_a_convocatoria(
                  '00000000-0000-0000-0000-0000000000c1', 'Otro Salvavidas') ->> 'player_id')::uuid),
  '=', 6::numeric,
  'sin puntaje el invitado arranca en 6 (neutro)'
);

-- 7. Coordinador que NO gestiona esa convocatoria → not_authorized.
select _as('00000000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$ select public.agregar_invitado_a_convocatoria(
       '00000000-0000-0000-0000-0000000000c2', 'Ajeno', 5) $$,
  'P0013',
  null,
  'un coordinador no puede agregar invitado en una convocatoria ajena'
);

select * from finish();
rollback;
