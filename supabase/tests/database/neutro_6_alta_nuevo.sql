-- ============================================================================
-- FUT-110: el jugador nuevo nace con rating NEUTRO 6 (no el piso 1)
-- ============================================================================
--   1. claim_invite corre sin error.
--   2. El player nuevo nace con technical/physical/mental = 6/6/6.
--   3. rating_confidence = 'inicial' (= sin calibrar; FUT-127 Fase 3).
--   4. El rating POR GRUPO hereda neutro (phys_power = 6).
--   5. El internal_score por grupo es > 0 (refleja el 6, no el viejo piso).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

-- Auth users: owner/admin + el jugador nuevo que acepta el invite.
insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000',
   'owner-n6@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000',
   'nuevo-n6@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin', nombre = 'Owner N6'
 where id = '00000000-0000-0000-0000-0000000000c1';

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-0000000000ca', 'Cancha N6', '00000000-0000-0000-0000-0000000000c1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id, status) values
  ('00000000-0000-0000-0000-0000000000ce', 'Grupo N6', '00000000-0000-0000-0000-0000000000ca',
   2, '20:00', 10, '00000000-0000-0000-0000-0000000000c1', 'activo');

-- Invitación group-level (sin convocatoria), pending y vigente.
insert into public.player_invitations (
  token, phone, nombre_tentativo, grupo_id, created_by, expires_at
) values (
  'tok_neutro_6_1234567890', '+5491155559006', 'Nuevo Neutro',
  '00000000-0000-0000-0000-0000000000ce',
  '00000000-0000-0000-0000-0000000000c1',
  now() + interval '7 days'
);

select plan(5);

-- 1. Acepta el invite (alta atómica).
select lives_ok(
  $$ select public.claim_invite(
       'tok_neutro_6_1234567890',
       '00000000-0000-0000-0000-0000000000c2',
       'Nuevo Neutro',
       '1994-04-04'::date,
       32,
       'jugador_campo'::public.player_role_field,
       'mediocampista'::public.position_pref
     ) $$,
  'claim_invite: corre sin error'
);

-- 2. Ratings base neutros 6/6/6.
select is(
  (select technical::text || '/' || physical::text || '/' || mental::text
     from public.players where phone = '+5491155559006'),
  '6/6/6',
  'claim_invite: el jugador nuevo nace con 6/6/6 (neutro)'
);

-- 3. Confianza 'inicial' = sin calibrar (FUT-127 Fase 3: el trigger de alta
--    traduce el 'baja' histórico de las RPCs a 'inicial').
select is(
  (select rating_confidence::text from public.players where phone = '+5491155559006'),
  'inicial',
  'claim_invite: rating_confidence = inicial (sin calibrar)'
);

-- 4. El rating por grupo hereda el neutro (seed coalesce base 6).
select is(
  (select pgr.phys_power
     from public.player_group_ratings pgr
     join public.players p on p.id = pgr.player_id
    where p.phone = '+5491155559006'
      and pgr.grupo_id = '00000000-0000-0000-0000-0000000000ce'),
  6,
  'seed: el rating por grupo hereda phys_power = 6'
);

-- 5. El internal_score por grupo refleja el 6 (> 0, no el viejo piso).
select cmp_ok(
  (select pgr.internal_score
     from public.player_group_ratings pgr
     join public.players p on p.id = pgr.player_id
    where p.phone = '+5491155559006'
      and pgr.grupo_id = '00000000-0000-0000-0000-0000000000ce'),
  '>',
  0::numeric,
  'seed: internal_score por grupo > 0 (refleja el neutro)'
);

select * from finish();
rollback;
