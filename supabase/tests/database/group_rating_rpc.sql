-- ============================================================================
-- FUT-104: tests de RPC de rating por grupo + gate del veedor por grupo
-- ============================================================================
-- Cubre:
--   1. Grupo SIN gate -> propose aplica directo (applied=true).
--   2. ... y recalcula el score del grupo (subs técnicos a 10 -> 7.63).
--   3. Grupo CON gate -> propose queda pendiente (applied=false)...
--   4. ... y NO toca el rating todavía.
--   5. El veedor aprueba -> recién ahí se aplica (físico a 10 -> 8.38).
--   6. No-admin no puede proponer (P0013).
--   7. get_group_rating: el player no lo ve.
--   8. get_group_rating: el admin sí.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

select plan(8);

-- admin (a1), player con auth (a2 = b1) y veedor (a3).
insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'admin-gr@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'p1-gr@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000000',
   'veedor-gr@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin'  where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'player', nombre = 'P1'     where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set role = 'veedor', nombre = 'Veedor' where id = '00000000-0000-0000-0000-0000000000a3';

-- b1: base technical 8, physical 6, mental 7, edad 30. Subs null -> el seed los
-- coalesce a la dimensión (phys=6, ment=7, tech=8).
insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, auth_user_id
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'jugador_campo', 'mediocampista', 8, 6, 7, 'approved',
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2');

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

-- e1 SIN gate (veedor_activo default false). e2 CON gate.
insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6,
   '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e2', 'Grupo e2', '00000000-0000-0000-0000-00000000000a', 4, '21:00', 6,
   '00000000-0000-0000-0000-0000000000a1');
update public.grupos set veedor_activo = true where id = '00000000-0000-0000-0000-0000000000e2';

-- b1 entra a los dos grupos -> el seed crea su rating en cada uno.
insert into public.grupo_membresias (grupo_id, player_id, tipo, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'titular', 'activo'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b1', 'titular', 'activo');

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

-- ---- Grupo e1 SIN gate: aplica directo --------------------------------------
select _as('00000000-0000-0000-0000-0000000000a1');

select is(
  (public.propose_group_rating_change(
     '00000000-0000-0000-0000-0000000000b1',
     '00000000-0000-0000-0000-0000000000e1',
     '{"tech_passing":10,"tech_finishing":10,"tech_linkup":10}'::jsonb,
     'sube en este grupo')
  )->>'applied',
  'true',
  'Grupo sin gate: propose aplica directo (applied=true)'
);

select is(
  (select internal_score from public.player_group_ratings
    where player_id = '00000000-0000-0000-0000-0000000000b1'
      and grupo_id  = '00000000-0000-0000-0000-0000000000e1'),
  7.63::numeric,
  'Sin gate: el rating del grupo se recalcula al aplicar (7.63)'
);

-- ---- Grupo e2 CON gate: queda pendiente -------------------------------------
select is(
  (public.propose_group_rating_change(
     '00000000-0000-0000-0000-0000000000b1',
     '00000000-0000-0000-0000-0000000000e2',
     '{"phys_power":10,"phys_speed":10,"phys_stamina":10}'::jsonb,
     'rinde distinto acá')
  )->>'applied',
  'false',
  'Grupo con gate: propose queda pendiente (applied=false)'
);

select is(
  (select phys_power from public.player_group_ratings
    where player_id = '00000000-0000-0000-0000-0000000000b1'
      and grupo_id  = '00000000-0000-0000-0000-0000000000e2'),
  6,
  'Con gate: el rating no se toca hasta que el veedor apruebe'
);

-- ---- El veedor aprueba ------------------------------------------------------
select _as('00000000-0000-0000-0000-0000000000a3');

select public.approve_player_change_request(
  (select id from public.player_change_requests
    where grupo_id = '00000000-0000-0000-0000-0000000000e2' and status = 'pending'
    order by created_at desc limit 1)
);

select is(
  (select internal_score from public.player_group_ratings
    where player_id = '00000000-0000-0000-0000-0000000000b1'
      and grupo_id  = '00000000-0000-0000-0000-0000000000e2'),
  8.38::numeric,
  'El veedor aprueba -> recién ahí se aplica (físico a 10 -> 8.38)'
);

-- ---- No-admin no puede proponer ---------------------------------------------
select _as('00000000-0000-0000-0000-0000000000a2');

select throws_ok(
  $$ select public.propose_group_rating_change(
       '00000000-0000-0000-0000-0000000000b1',
       '00000000-0000-0000-0000-0000000000e1',
       '{"tech_passing":9}'::jsonb, 'no deberia') $$,
  'P0013',
  'not_authorized',
  'Un no-admin no puede proponer cambios de rating de grupo'
);

-- ---- get_group_rating: visibilidad ------------------------------------------
select is(
  (select count(*)::int from public.get_group_rating(
     '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e1')),
  0,
  'get_group_rating: el player no ve el rating'
);

select _as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from public.get_group_rating(
     '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e1')),
  1,
  'get_group_rating: el admin sí ve el rating'
);

select * from finish();
rollback;
