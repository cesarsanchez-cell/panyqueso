-- ============================================================================
-- Fase 10 fix: _conv_compactar_cola renumera la cola sin chocar con el indice
-- ============================================================================
--
-- Repro del bug: admin quita a un suplente del medio de la cola. La
-- compactacion renumeraba con un solo UPDATE (orden - 1) y chocaba con
-- convocatoria_players_suplente_orden_uq ("duplicate key"). Con el fix en dos
-- fases corre sin error y deja la cola compacta 1..N.
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
   'admin-ccola@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin', nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';

insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, auth_user_id
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000b2', 'P2', 28, 'jugador_campo', 'defensor',      5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000b3', 'P3', 32, 'jugador_campo', 'delantero',     7, 7, 7, 'approved', '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000b4', 'P4', 26, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000b5', 'P5', 29, 'jugador_campo', 'defensor',      6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', null);

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 2, '00000000-0000-0000-0000-0000000000a1');

insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date + 3, '20:00', 2, 'abierta', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1');

-- 2 titulares (b1,b2) + 3 suplentes (b3=1, b4=2, b5=3).
insert into public.convocatoria_players (
  id, convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b2', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b3', 'confirmado', 'suplente', 1),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b4', 'confirmado', 'suplente', 2),
  ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b5', 'confirmado', 'suplente', 3);

select plan(4);

-- 1. Quitar al PRIMER suplente (b3, orden 1) no debe romper con duplicate key.
select lives_ok(
  $$ select public.admin_remove_from_convocatoria('00000000-0000-0000-0000-0000000000f3'::uuid) $$,
  'quitar suplente del medio de la cola no choca con el indice unico'
);

-- 2. b4 quedo orden 1 (subio una posicion).
select is(
  (select orden_suplente from public.convocatoria_players where id = '00000000-0000-0000-0000-0000000000f4'),
  1,
  'b4 quedo suplente orden 1'
);

-- 3. b5 quedo orden 2.
select is(
  (select orden_suplente from public.convocatoria_players where id = '00000000-0000-0000-0000-0000000000f5'),
  2,
  'b5 quedo suplente orden 2'
);

-- 4. La cola quedo compacta 1..N (sin huecos ni duplicados).
select is(
  (select array_agg(orden_suplente order by orden_suplente)
     from public.convocatoria_players
    where convocatoria_id = '00000000-0000-0000-0000-0000000000c1'
      and rol_en_convocatoria = 'suplente'
      and attendance_status <> 'declinado'),
  array[1, 2],
  'cola compacta 1..2 sin huecos'
);

select * from finish();
rollback;
