-- ============================================================================
-- Audit Major 1: el set de "titulares no-declinados" que usa confirmMatch
-- ============================================================================
--
-- confirmMatch (app) carga los convocados filtrando
--   rol_en_convocatoria = 'titular' AND attendance_status <> 'declinado'
-- igual que el generador. Asi, si tras generar el draft un titular se baja,
-- la confirmacion bloquea (el jugador bajado ya no esta en ese set y el draft
-- viejo lo referencia -> checkWarnings lo marca "ya no titular").
--
-- Este test guarda el invariante de datos en que se apoya ese fix:
-- player_decline_convocatoria marca al decliner como declinado PERO le deja
-- rol='titular', y promueve al primer suplente a titular. Entonces el filtro
-- por rol SOLO no alcanza: hace falta tambien attendance <> 'declinado'.
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
   'admin-ctf@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'p1-ctf@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'player', nombre = 'P1'    where id = '00000000-0000-0000-0000-0000000000a2';

-- b1 = titular (logueable como player a2), b2 = suplente.
insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, auth_user_id
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000b2', 'P2', 28, 'jugador_campo', 'defensor',      5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000a1', null);

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6, '00000000-0000-0000-0000-0000000000a1');

-- Conv abierta con b1 titular + b2 suplente.
insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date + 1, '20:00', 6, 'abierta', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1');

insert into public.convocatoria_players (convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b2', 'confirmado', 'suplente', 1);

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

-- El titular b1 (player a2) se baja.
select _as('00000000-0000-0000-0000-0000000000a2');
select lives_ok(
  $$select public.player_decline_convocatoria('00000000-0000-0000-0000-0000000000c1'::uuid)$$,
  'titular b1 declina sin error'
);

-- Gotcha: b1 queda declinado PERO conserva rol='titular'.
select is(
  (select rol_en_convocatoria::text from public.convocatoria_players
    where convocatoria_id = '00000000-0000-0000-0000-0000000000c1'
      and player_id = '00000000-0000-0000-0000-0000000000b1'),
  'titular',
  'b1 declinado conserva rol=titular (por eso el filtro necesita attendance<>declinado)'
);

-- El set que usa confirmMatch (rol=titular AND attendance<>declinado):
-- 1 fila, y es b2 (el suplente promovido), NO b1.
select is(
  (select count(*)::int from public.convocatoria_players
    where convocatoria_id = '00000000-0000-0000-0000-0000000000c1'
      and rol_en_convocatoria = 'titular'
      and attendance_status <> 'declinado'),
  1,
  'titulares no-declinados: exactamente 1'
);

select is_empty(
  $$select 1 from public.convocatoria_players
     where convocatoria_id = '00000000-0000-0000-0000-0000000000c1'
       and rol_en_convocatoria = 'titular'
       and attendance_status <> 'declinado'
       and player_id = '00000000-0000-0000-0000-0000000000b1'$$,
  'b1 (bajado) NO esta en el set de titulares para confirmar'
);

select isnt_empty(
  $$select 1 from public.convocatoria_players
     where convocatoria_id = '00000000-0000-0000-0000-0000000000c1'
       and rol_en_convocatoria = 'titular'
       and attendance_status <> 'declinado'
       and player_id = '00000000-0000-0000-0000-0000000000b2'$$,
  'b2 (suplente promovido) SI esta en el set de titulares para confirmar'
);

select * from finish();
rollback;
