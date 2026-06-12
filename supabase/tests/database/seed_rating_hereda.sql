-- ============================================================================
-- FUT-108 (2c-3a): el seed del rating por grupo hereda del más reciente
-- ============================================================================
--   1. Un jugador con rating en e1 (distinto de su base) que entra a e2 HEREDA
--      el rating de e1, no la base.
--   2. Un jugador sin rating de grupo previo copia de la BASE (comportamiento
--      original).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

select plan(3);

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'admin-sh@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin', nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';

-- Base: physical/mental/technical = 6, subs null (coalescen a la dimensión = 6).
insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by
) values
  ('00000000-0000-0000-0000-0000000000b1', 'P1', 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved',
   '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b2', 'P2', 28, 'jugador_campo', 'delantero', 6, 6, 6, 'approved',
   '00000000-0000-0000-0000-0000000000a1');

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a', 2, '20:00', 6,
   '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e2', 'Grupo e2', '00000000-0000-0000-0000-00000000000a', 4, '21:00', 6,
   '00000000-0000-0000-0000-0000000000a1');

-- b1 entra a e1 -> seed desde la base (todos los subs = 6).
insert into public.grupo_membresias (grupo_id, player_id, tipo) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'titular');

-- Afinamos el rating de b1 en e1: phys_power 6 -> 10 (ahora difiere de la base).
update public.player_group_ratings
   set phys_power = 10
 where player_id = '00000000-0000-0000-0000-0000000000b1'
   and grupo_id  = '00000000-0000-0000-0000-0000000000e1';

-- b1 entra a e2 -> debe HEREDAR de e1 (su único rating, el más reciente).
insert into public.grupo_membresias (grupo_id, player_id, tipo) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b1', 'titular');

-- b2 entra a e1 -> sin rating previo, copia de la base.
insert into public.grupo_membresias (grupo_id, player_id, tipo) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b2', 'titular');

-- 1. b1 en e2 heredó phys_power = 10 (de e1), no la base 6.
select is(
  (select phys_power from public.player_group_ratings
    where player_id = '00000000-0000-0000-0000-0000000000b1'
      and grupo_id  = '00000000-0000-0000-0000-0000000000e2'),
  10,
  'b1 hereda el rating del grupo más reciente (e1), no la base'
);

-- 2. El score heredado de e2 coincide con el de e1 (misma edad global).
select is(
  (select internal_score from public.player_group_ratings
    where player_id = '00000000-0000-0000-0000-0000000000b1' and grupo_id = '00000000-0000-0000-0000-0000000000e2'),
  (select internal_score from public.player_group_ratings
    where player_id = '00000000-0000-0000-0000-0000000000b1' and grupo_id = '00000000-0000-0000-0000-0000000000e1'),
  'el score heredado coincide con el del grupo de origen'
);

-- 3. b2, sin rating previo, copia de la base (phys_power = 6).
select is(
  (select phys_power from public.player_group_ratings
    where player_id = '00000000-0000-0000-0000-0000000000b2'
      and grupo_id  = '00000000-0000-0000-0000-0000000000e1'),
  6,
  'b2 sin rating previo copia de la base'
);

select * from finish();
rollback;
