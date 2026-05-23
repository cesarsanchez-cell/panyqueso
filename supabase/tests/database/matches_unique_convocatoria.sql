-- ============================================================================
-- Fase 6 self-audit hotfix: test de unique(convocatoria_id) en matches
-- ============================================================================
--
-- Cubre:
--   - Primer INSERT lives_ok.
--   - Segundo INSERT con mismo convocatoria_id falla con 23505.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-000000000000',
  'admin-mu@test.local', '', 'authenticated', 'authenticated',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
);

update public.profiles
   set role = 'admin', nombre = 'Test Admin'
 where id = '00000000-0000-0000-0000-0000000000a1';

-- Convocatoria.
insert into public.convocatorias (id, fecha, hora, cupo_maximo, created_by)
values (
  '00000000-0000-0000-0000-0000000000c1',
  current_date + 1, '20:00', 12,
  '00000000-0000-0000-0000-0000000000a1'
);

select plan(2);

-- 1. Primer INSERT en matches lives_ok.
select lives_ok(
  $$insert into public.matches (
      convocatoria_id, fecha, algorithm_version, confirmed_by, confirmed_at
    ) values (
      '00000000-0000-0000-0000-0000000000c1',
      current_date + 1, 'v1.0',
      '00000000-0000-0000-0000-0000000000a1', now()
    )$$,
  'Primer match para una convocatoria: lives_ok'
);

-- 2. Segundo INSERT con mismo convocatoria_id falla con 23505 (unique violation).
select throws_like(
  $$insert into public.matches (
      convocatoria_id, fecha, algorithm_version, confirmed_by, confirmed_at
    ) values (
      '00000000-0000-0000-0000-0000000000c1',
      current_date + 1, 'v1.0',
      '00000000-0000-0000-0000-0000000000a1', now()
    )$$,
  '%matches_convocatoria_id_unique%',
  'Segundo match con misma convocatoria_id: rechazado por unique constraint'
);

select * from finish();
rollback;
