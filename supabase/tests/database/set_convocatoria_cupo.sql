-- ============================================================================
-- Fase 10: tests de set_convocatoria_cupo (editar titulares + reacomodar roster)
-- ============================================================================
--
-- Cubre:
--   1. Subir el cupo promueve suplentes a titular.
--   2. Bajar el cupo manda los ultimos titulares (por antiguedad) a la cola.
--   3. La cola queda compacta y ordenada (1..M).
--   4. Cupo fuera de rango -> P0061.
--   5. Convocatoria no abierta -> P0060.
--
-- Roster: b1..b6 titulares, b7/b8 suplentes (orden 1/2). added_at explicito y
-- creciente para que el orden de reacomodo sea determinista.
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
   'admin-cupo@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin', nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';

insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, auth_user_id
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000b2', 'P2', 28, 'jugador_campo', 'defensor',      5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000b3', 'P3', 32, 'jugador_campo', 'delantero',     7, 7, 7, 'approved', '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000b4', 'P4', 26, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000b5', 'P5', 29, 'jugador_campo', 'defensor',      6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000b6', 'P6', 31, 'jugador_campo', 'delantero',     6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000b7', 'P7', 27, 'jugador_campo', 'mediocampista', 5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000b8', 'P8', 33, 'jugador_campo', 'defensor',      5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1', null);

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6, '00000000-0000-0000-0000-0000000000a1');

insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date + 3, '20:00', 6, 'abierta', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1');

-- Roster con added_at creciente (b1 mas antiguo ... b8 mas nuevo).
insert into public.convocatoria_players (
  convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente, added_at
) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'confirmado', 'titular',  null, now() + interval '1 second'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b2', 'confirmado', 'titular',  null, now() + interval '2 second'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b3', 'confirmado', 'titular',  null, now() + interval '3 second'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b4', 'confirmado', 'titular',  null, now() + interval '4 second'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b5', 'confirmado', 'titular',  null, now() + interval '5 second'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b6', 'confirmado', 'titular',  null, now() + interval '6 second'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b7', 'confirmado', 'suplente', 1,    now() + interval '7 second'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b8', 'confirmado', 'suplente', 2,    now() + interval '8 second');

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select plan(8);

select _as('00000000-0000-0000-0000-0000000000a1');

-- 1. Subir cupo a 8: promueve b7 y b8 a titular.
select lives_ok(
  $$select public.set_convocatoria_cupo('00000000-0000-0000-0000-0000000000c1'::uuid, 8)$$,
  'subir cupo a 8 corre sin error'
);
select is(
  (select count(*)::int from public.convocatoria_players
    where convocatoria_id = '00000000-0000-0000-0000-0000000000c1'
      and rol_en_convocatoria = 'titular' and attendance_status <> 'declinado'),
  8,
  'tras subir a 8: 8 titulares'
);
select is(
  (select count(*)::int from public.convocatoria_players
    where convocatoria_id = '00000000-0000-0000-0000-0000000000c1'
      and rol_en_convocatoria = 'suplente' and attendance_status <> 'declinado'),
  0,
  'tras subir a 8: 0 suplentes'
);

-- 2. Bajar cupo a 6: los 2 ultimos por antiguedad (b7, b8) vuelven a la cola.
select lives_ok(
  $$select public.set_convocatoria_cupo('00000000-0000-0000-0000-0000000000c1'::uuid, 6)$$,
  'bajar cupo a 6 corre sin error'
);
select is(
  (select count(*)::int from public.convocatoria_players
    where convocatoria_id = '00000000-0000-0000-0000-0000000000c1'
      and rol_en_convocatoria = 'titular' and attendance_status <> 'declinado'),
  6,
  'tras bajar a 6: 6 titulares'
);
select is(
  (select string_agg(player_id::text, ',' order by orden_suplente)
     from public.convocatoria_players
    where convocatoria_id = '00000000-0000-0000-0000-0000000000c1'
      and rol_en_convocatoria = 'suplente' and attendance_status <> 'declinado'),
  '00000000-0000-0000-0000-0000000000b7,00000000-0000-0000-0000-0000000000b8',
  'tras bajar a 6: b7 (orden 1) y b8 (orden 2) en la cola, compacta'
);

-- 3. Cupo fuera de rango -> P0061.
select throws_ok(
  $$select public.set_convocatoria_cupo('00000000-0000-0000-0000-0000000000c1'::uuid, 30)$$,
  'P0061',
  'cupo_fuera_de_rango',
  'cupo > 24: lanza P0061'
);

-- 4. Convocatoria no abierta -> P0060.
update public.convocatorias set status = 'cerrada' where id = '00000000-0000-0000-0000-0000000000c1';
select throws_ok(
  $$select public.set_convocatoria_cupo('00000000-0000-0000-0000-0000000000c1'::uuid, 6)$$,
  'P0060',
  'convocatoria_no_abierta',
  'conv cerrada: lanza P0060'
);

select * from finish();
rollback;
