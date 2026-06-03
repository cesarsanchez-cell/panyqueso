-- ============================================================================
-- Fase 10 fix: el trigger sync_open_conv_after_membership_change respeta el
-- cupo de la CONVOCATORIA al dar de alta/reactivar una membresia
-- ============================================================================
--
-- Repro del bug: grupo con cupo_titulares 8, pero la convocatoria tiene
-- cupo_maximo 6 (el admin lo bajo). Con 6 titulares y 1 suplente esperando, al
-- reactivar la membresia de un jugador que NO esta en la conv, el trigger debe
-- meterlo en la cola de SUPLENTES (6 = cupo de la conv), no como titular. Antes
-- comparaba contra el grupo (6 < 8) y lo dejaba titular.
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
   'admin-strig@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

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

-- Grupo cupo_titulares 8, pero la convocatoria con cupo_maximo 6.
insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 8, '00000000-0000-0000-0000-0000000000a1');

insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date + 3, '20:00', 6, 'abierta', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1');

-- Estado base de la conv: 6 titulares (b2..b7) + 1 suplente (b8). b1 NO esta.
insert into public.convocatoria_players (
  convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b2', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b3', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b4', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b5', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b6', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b7', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b8', 'confirmado', 'suplente', 1);

-- Membresia de b1 en el grupo, inicialmente inactiva. La insercion no dispara
-- la rama de alta del trigger (was_active=false, is_active=false -> no-op).
insert into public.grupo_membresias (grupo_id, player_id, tipo, orden, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'titular', null, 'inactivo');

select plan(3);

-- Disparador: reactivar la membresia de b1 (inactivo -> activo). Esto corre el
-- trigger sync_open_conv_after_membership_change por la rama de alta.
update public.grupo_membresias
   set status = 'activo'
 where grupo_id = '00000000-0000-0000-0000-0000000000e1'
   and player_id = '00000000-0000-0000-0000-0000000000b1';

-- 1. b1 quedo como SUPLENTE (cupo de la conv lleno: 6/6), no titular.
select is(
  (select rol_en_convocatoria::text
     from public.convocatoria_players
    where convocatoria_id = '00000000-0000-0000-0000-0000000000c1'
      and player_id = '00000000-0000-0000-0000-0000000000b1'),
  'suplente',
  'reactivar membresia con cupo de la conv lleno -> suplente (no titular pese a grupo.cupo 8)'
);

-- 2. b1 quedo al final de la cola (orden 2, detras de b8).
select is(
  (select orden_suplente
     from public.convocatoria_players
    where convocatoria_id = '00000000-0000-0000-0000-0000000000c1'
      and player_id = '00000000-0000-0000-0000-0000000000b1'),
  2,
  'b1 quedo suplente al final de la cola (orden 2)'
);

-- 3. Sanity: siguen siendo 6 titulares (el trigger no toco a los existentes).
select is(
  (select count(*)::int
     from public.convocatoria_players
    where convocatoria_id = '00000000-0000-0000-0000-0000000000c1'
      and rol_en_convocatoria = 'titular'
      and attendance_status <> 'declinado'),
  6,
  'siguen 6 titulares tras la reactivacion'
);

select * from finish();
rollback;
