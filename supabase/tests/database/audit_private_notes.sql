-- ============================================================================
-- AUDIT FASE 3 - Major 1: tests del trigger players_log_private_notes
-- ============================================================================
--
-- Verifica:
--   1. UPDATE de private_notes inserta una linea en audit_log con actor +
--      old/new.
--   2. UPDATE con mismo valor no inserta nada (WHEN IS DISTINCT FROM).
--   3. UPDATE a NULL inserta otra linea con new = null.
--   4. UPDATE de updated_at (sin tocar private_notes) no inserta nada
--      (column-list trigger filtra).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

-- ---------------------------------------------------------------------------
-- Setup: admin + player approved
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  '00000000-0000-0000-0000-0000000000d1',
  '00000000-0000-0000-0000-000000000000',
  'admin-audit@test.local', '', 'authenticated', 'authenticated',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb
);

update public.profiles
   set role = 'admin', nombre = 'Audit Admin'
 where id = '00000000-0000-0000-0000-0000000000d1';

insert into public.players (
  id, nombre, edad, role_field, position_pref,
  technical, physical, mental, status, created_by, private_notes
) values (
  '00000000-0000-0000-0000-0000000000e1',
  'Audit Target',
  28, 'jugador_campo', 'mediocampista',
  6, 6, 6, 'approved',
  '00000000-0000-0000-0000-0000000000d1',
  null
);

-- Helper de identidad (mismo patron que rls_phase2.sql).
create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

create or replace function _as_postgres()
returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Plan
-- ---------------------------------------------------------------------------
select plan(6);

-- 1. UPDATE set private_notes = 'nota uno' -> 1 fila en audit_log.
select _as('00000000-0000-0000-0000-0000000000d1');
update public.players
   set private_notes = 'nota uno'
 where id = '00000000-0000-0000-0000-0000000000e1';

select _as_postgres();
select is(
  (select count(*)::int from public.audit_log
    where entity = 'player'
      and entity_id = '00000000-0000-0000-0000-0000000000e1'
      and action = 'update_private_notes'),
  1,
  'UPDATE private_notes inserta 1 linea en audit_log'
);

select is(
  (select actor_id from public.audit_log
    where entity_id = '00000000-0000-0000-0000-0000000000e1'
      and action = 'update_private_notes'
    order by created_at asc limit 1),
  '00000000-0000-0000-0000-0000000000d1'::uuid,
  'audit_log.actor_id = admin'
);

select is(
  (select payload from public.audit_log
    where entity_id = '00000000-0000-0000-0000-0000000000e1'
      and action = 'update_private_notes'
    order by created_at asc limit 1),
  jsonb_build_object('old', null, 'new', 'nota uno'),
  'payload incluye old=null y new=nota uno'
);

-- 2. UPDATE con mismo valor -> no inserta (WHEN IS DISTINCT FROM filtra).
select _as('00000000-0000-0000-0000-0000000000d1');
update public.players
   set private_notes = 'nota uno'
 where id = '00000000-0000-0000-0000-0000000000e1';

select _as_postgres();
select is(
  (select count(*)::int from public.audit_log
    where entity_id = '00000000-0000-0000-0000-0000000000e1'
      and action = 'update_private_notes'),
  1,
  'UPDATE con mismo valor: WHEN filtra, no se inserta nada'
);

-- 3. UPDATE a NULL -> 2 filas, ultima con new=null.
select _as('00000000-0000-0000-0000-0000000000d1');
update public.players
   set private_notes = null
 where id = '00000000-0000-0000-0000-0000000000e1';

select _as_postgres();
select is(
  (select count(*)::int from public.audit_log
    where entity_id = '00000000-0000-0000-0000-0000000000e1'
      and action = 'update_private_notes'),
  2,
  'UPDATE a NULL inserta segunda linea'
);

-- 4. UPDATE de otra columna no audita (column-list trigger).
-- updated_at no tiene column GRANT para admin, asi que lo cambiamos via
-- postgres para verificar que el trigger no dispara cuando la columna
-- private_notes no aparece en el SET.
select _as_postgres();
update public.players
   set updated_at = now()
 where id = '00000000-0000-0000-0000-0000000000e1';

select is(
  (select count(*)::int from public.audit_log
    where entity_id = '00000000-0000-0000-0000-0000000000e1'
      and action = 'update_private_notes'),
  2,
  'UPDATE de otra columna no dispara trigger (column-list OF private_notes)'
);

select * from finish();
rollback;
