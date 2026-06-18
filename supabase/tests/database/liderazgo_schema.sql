-- ============================================================================
-- Tests: liderazgo (Fase 1) — esquema, seed/herencia, apply y coeficientes
-- ============================================================================
--
-- Cubre:
--   1. Seed base → liderazgo 'ninguno' por default.
--   2. Herencia: setear liderazgo en un grupo, unirse a otro → lo hereda.
--   3. _group_rating_snapshot incluye la clave 'liderazgo'.
--   4. _apply_group_rating_request aplica el liderazgo propuesto.
--   5/6. app_settings: coeficientes default 1.00.
--   7. set_liderazgo_coeficientes (admin) actualiza.
--   8. set_liderazgo_coeficientes (no-admin) → P0013.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

-- Auth: admin (a1) + player (a2) -------------------------------------------
insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'admin-lid@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'player-lid@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'player', nombre = 'P'     where id = '00000000-0000-0000-0000-0000000000a2';

-- Player base + lugar + dos grupos -----------------------------------------
insert into public.players (
  id, nombre, edad, role_field, position_pref, positions_possible,
  technical, physical, mental, status, created_by
) values
  ('00000000-0000-0000-0000-0000000000b1', 'Lider', 30, 'jugador_campo', 'mediocampista',
   array['mediocampista']::public.position_pref[], 6, 6, 6, 'approved',
   '00000000-0000-0000-0000-0000000000a1');

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo A', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e2', 'Grupo B', '00000000-0000-0000-0000-00000000000a', 4, '21:00', 6, '00000000-0000-0000-0000-0000000000a1');

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

-- 1. Alta en grupo A: el seed base deja liderazgo 'ninguno'.
insert into public.grupo_membresias (grupo_id, player_id, tipo, status)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'titular', 'activo');

select is(
  (select liderazgo::text from public.player_group_ratings
    where player_id = '00000000-0000-0000-0000-0000000000b1'
      and grupo_id = '00000000-0000-0000-0000-0000000000e1'),
  'ninguno',
  'seed base: liderazgo arranca en ninguno'
);

-- 2. Herencia: marco líder 'alto' en A; al unirse a B se hereda.
update public.player_group_ratings set liderazgo = 'alto'
 where player_id = '00000000-0000-0000-0000-0000000000b1'
   and grupo_id = '00000000-0000-0000-0000-0000000000e1';

insert into public.grupo_membresias (grupo_id, player_id, tipo, status)
values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b1', 'titular', 'activo');

select is(
  (select liderazgo::text from public.player_group_ratings
    where player_id = '00000000-0000-0000-0000-0000000000b1'
      and grupo_id = '00000000-0000-0000-0000-0000000000e2'),
  'alto',
  'herencia: el grupo nuevo hereda el liderazgo del grupo previo'
);

-- 3. El snapshot incluye la clave 'liderazgo'.
select ok(
  public._group_rating_snapshot(
    '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-0000000000e2'
  ) ? 'liderazgo',
  'snapshot incluye liderazgo'
);

-- 4. _apply_group_rating_request aplica el liderazgo propuesto (B: alto → medio).
insert into public.player_change_requests (
  id, player_id, grupo_id, action_type, requested_by,
  old_values, proposed_values, fields_changed, reason, status
) values (
  '00000000-0000-0000-0000-0000000000d1',
  '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000e2',
  'update_sensitive_fields',
  '00000000-0000-0000-0000-0000000000a1',
  null,
  jsonb_build_object('liderazgo', 'medio'),
  array['liderazgo'],
  'baja un escalón',
  'pending'
);

select public._apply_group_rating_request(
  '00000000-0000-0000-0000-0000000000d1',
  '00000000-0000-0000-0000-0000000000a1',
  'ok',
  'approve_change_request'
);

select is(
  (select liderazgo::text from public.player_group_ratings
    where player_id = '00000000-0000-0000-0000-0000000000b1'
      and grupo_id = '00000000-0000-0000-0000-0000000000e2'),
  'medio',
  'apply: el liderazgo propuesto se aplica'
);

-- 5/6. Coeficientes default 1.00.
select is(
  (select liderazgo_coef_medio from public.app_settings where id),
  1.00,
  'coef medio default 1.00'
);
select is(
  (select liderazgo_coef_alto from public.app_settings where id),
  1.00,
  'coef alto default 1.00'
);

-- 7. Admin ajusta los coeficientes.
select _as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$select public.set_liderazgo_coeficientes(1.10, 1.25)$$,
  'admin: set_liderazgo_coeficientes corre'
);
reset role;

-- 8. No-admin → forbidden (P0013).
select _as('00000000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$select public.set_liderazgo_coeficientes(1.10, 1.25)$$,
  'P0013',
  null,
  'no-admin: set_liderazgo_coeficientes lanza P0013'
);
reset role;

select * from finish();
rollback;
