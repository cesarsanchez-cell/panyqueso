-- ============================================================================
-- FUT-86 Fase 2a: el trigger calcula internal_score con la fórmula v2
-- ============================================================================
--
-- Cubre:
--   1. Insert con edad 40 (factor 0.90), todo 10 → internal_score = 9.65.
--   2. Insert con edad 30 (factor 1.00), todo 10 → internal_score = 10.00.
--   3. Coincide con compute_internal_score_v2 para valores mixtos.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000000',
   'admin-score@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin', nombre = 'Admin Score' where id = '00000000-0000-0000-0000-0000000000f1';

insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by
) values
  ('00000000-0000-0000-0000-0000000000c1', 'P40', 40, 'jugador_campo', 'delantero', 10, 10, 10, 'approved', '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000c2', 'P30', 30, 'jugador_campo', 'defensor',  10, 10, 10, 'approved', '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000c3', 'PMix', 50, 'jugador_campo', 'mediocampista', 8, 6, 7, 'approved', '00000000-0000-0000-0000-0000000000f1');

select plan(3);

-- 1. edad 40 (factor 0.90), todo 10: 10×0.9×0.35 + 10×0.325 + 10×0.325 = 9.65.
select is(
  (select internal_score from public.players where id = '00000000-0000-0000-0000-0000000000c1'),
  9.65::numeric,
  'internal_score v2: edad 40, todo 10 → 9.65'
);

-- 2. edad 30 (factor 1.00), todo 10 → 10.00.
select is(
  (select internal_score from public.players where id = '00000000-0000-0000-0000-0000000000c2'),
  10.00::numeric,
  'internal_score v2: edad 30, todo 10 → 10.00'
);

-- 3. Coincide con compute_internal_score_v2 (valores mixtos, edad 50 → factor 0.80).
select is(
  (select internal_score from public.players where id = '00000000-0000-0000-0000-0000000000c3'),
  public.compute_internal_score_v2(6, 7, 8, 50),
  'internal_score v2: coincide con compute_internal_score_v2 (mixto)'
);

select * from finish();
rollback;
