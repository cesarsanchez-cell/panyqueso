-- ============================================================================
-- Audit Major 1: el filtro de "titulares no-declinados" que usa confirmMatch
-- ============================================================================
--
-- confirmMatch (app) carga los convocados filtrando
--   rol_en_convocatoria = 'titular' AND attendance_status <> 'declinado'
-- igual que el generador. Asi, si tras generar el draft un titular se baja,
-- el jugador bajado deja de estar en ese set: el draft viejo lo referencia y
-- checkWarnings lo marca "ya no titular", bloqueando la confirmacion.
--
-- Gotcha que motiva el fix: player_decline_convocatoria marca al decliner como
-- declinado PERO le deja rol='titular' (solo cambia attendance_status). Por eso
-- filtrar por rol SOLO no alcanza; hace falta tambien attendance <> 'declinado'.
--
-- Este test arma el estado post-decline de forma deterministica (sin depender
-- del RPC de decline ni de triggers) y verifica el contrato del filtro.
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
   'admin-ctf@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin', nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';

-- b1 = titular que se bajo (declinado pero conserva rol=titular).
-- b2 = titular activo.
insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b2', 'P2', 28, 'jugador_campo', 'defensor',      5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1');

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date + 1, '20:00', 6, 'abierta', '00000000-0000-0000-0000-0000000000a1');

-- Estado post-decline: b1 declinado conservando rol=titular (como deja el RPC),
-- b2 titular confirmado.
insert into public.convocatoria_players (convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'declinado',  'titular', null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b2', 'confirmado', 'titular', null);

select plan(4);

-- 1. Un filtro por rol SOLO veria 2 titulares (incluye al bajado): el bug.
select is(
  (select count(*)::int from public.convocatoria_players
    where convocatoria_id = '00000000-0000-0000-0000-0000000000c1'
      and rol_en_convocatoria = 'titular'),
  2,
  'rol solo: 2 titulares (incluye al declinado -> el bug que se arreglo)'
);

-- 2. El filtro de confirmMatch (rol + attendance) ve solo 1.
select is(
  (select count(*)::int from public.convocatoria_players
    where convocatoria_id = '00000000-0000-0000-0000-0000000000c1'
      and rol_en_convocatoria = 'titular'
      and attendance_status <> 'declinado'),
  1,
  'rol + attendance: 1 titular (el declinado excluido)'
);

-- 3. El bajado (b1) NO esta en el set de confirmMatch.
select is_empty(
  $$select 1 from public.convocatoria_players
     where convocatoria_id = '00000000-0000-0000-0000-0000000000c1'
       and rol_en_convocatoria = 'titular'
       and attendance_status <> 'declinado'
       and player_id = '00000000-0000-0000-0000-0000000000b1'$$,
  'b1 (bajado, declinado) NO entra al set de confirmMatch'
);

-- 4. El titular activo (b2) SI esta.
select isnt_empty(
  $$select 1 from public.convocatoria_players
     where convocatoria_id = '00000000-0000-0000-0000-0000000000c1'
       and rol_en_convocatoria = 'titular'
       and attendance_status <> 'declinado'
       and player_id = '00000000-0000-0000-0000-0000000000b2'$$,
  'b2 (titular activo) SI entra al set de confirmMatch'
);

select * from finish();
rollback;
