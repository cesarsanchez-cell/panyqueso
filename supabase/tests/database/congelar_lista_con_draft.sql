-- ============================================================================
-- FUT-112: con team_draft, el jugador no puede tocar la lista; el admin sí
-- ============================================================================
--   1. Con draft, el jugador que se baja (player_decline) -> P0071.
--   2. Con draft, el admin SÍ puede modificar convocatoria_players (trigger no lo
--      toca: current_player_id() es NULL para el admin).
--   3. Sin draft, el jugador se baja normalmente (lives_ok).
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
   'admin-fr@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'p1-fr@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'player', nombre = 'P1'    where id = '00000000-0000-0000-0000-0000000000a2';

insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, auth_user_id
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved',
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000b2', 'P2', 28, 'jugador_campo', 'defensor', 5, 5, 5, 'approved',
   '00000000-0000-0000-0000-0000000000a1', null);

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6,
   '00000000-0000-0000-0000-0000000000a1');

insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date + 3, '20:00', 6, 'abierta',
   '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1');

insert into public.convocatoria_players (
  convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'confirmado', 'titular', null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b2', 'confirmado', 'titular', null);

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

-- Generamos un draft (basta con setear el campo).
update public.convocatorias
   set team_draft = '{"A":{"goalkeeperPlayerId":null,"playerIds":[]},"B":{"goalkeeperPlayerId":null,"playerIds":[]}}'::jsonb
 where id = '00000000-0000-0000-0000-0000000000c1';

-- 1. Con draft, el jugador NO puede bajarse.
select _as('00000000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$ select public.player_decline_convocatoria('00000000-0000-0000-0000-0000000000c1'::uuid) $$,
  'P0071',
  null,
  'con draft, el jugador que se baja dispara lista_cerrada_draft (P0071)'
);

-- 2. Con draft, el admin SÍ puede tocar la lista (el trigger no lo bloquea).
select _as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$ update public.convocatoria_players
        set attendance_status = 'declinado'
      where convocatoria_id = '00000000-0000-0000-0000-0000000000c1'
        and player_id = '00000000-0000-0000-0000-0000000000b2' $$,
  'con draft, el admin puede modificar la lista (current_player_id NULL)'
);

-- 3. Sin draft, el jugador se baja normalmente.
update public.convocatorias set team_draft = null
 where id = '00000000-0000-0000-0000-0000000000c1';
select _as('00000000-0000-0000-0000-0000000000a2');
select lives_ok(
  $$ select public.player_decline_convocatoria('00000000-0000-0000-0000-0000000000c1'::uuid) $$,
  'sin draft, el jugador se baja sin problema'
);

select * from finish();
rollback;
