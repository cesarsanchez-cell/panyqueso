-- ============================================================================
-- Fase 5 PR 1: tests RLS de lugares
-- ============================================================================
--
-- Cubre:
--   - admin puede SELECT/INSERT/UPDATE.
--   - veedor puede SELECT, NO INSERT, NO UPDATE.
--   - sin rol (authenticated sin role) no accede.
--   - DELETE bloqueado para todos los clientes.
--   - check trim(nombre) <> '' rechaza nombres vacios.
--   - unique case-insensitive (lower(nombre)) rechaza duplicados con
--     distinta capitalizacion.
--   - trigger lugares_normalize_insert fuerza created_by = auth.uid().
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

-- ---------------------------------------------------------------------------
-- Setup: 3 usuarios (admin, veedor, sin rol)
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000000',
   'admin-lugares@test.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-000000000000',
   'veedor-lugares@test.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a3',
   '00000000-0000-0000-0000-000000000000',
   'sinrol-lugares@test.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles
   set role = 'admin', nombre = 'Test Admin'
 where id = '00000000-0000-0000-0000-0000000000a1';

update public.profiles
   set role = 'veedor', nombre = 'Test Veedor'
 where id = '00000000-0000-0000-0000-0000000000a2';

-- Sembrar un lugar previo desde postgres para tests de SELECT.
insert into public.lugares (id, nombre, created_by)
values (
  '00000000-0000-0000-0000-0000000000f1',
  'Cancha Norte',
  '00000000-0000-0000-0000-0000000000a1'
);

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
select plan(13);

-- 1. sin rol pero authenticated: SI ve lugares (Fase 9: lugares_select_authenticated).
-- Antes era 0 (solo admin/veedor); ahora 1 porque el player tambien lee.
select _as('00000000-0000-0000-0000-0000000000a3');
select is(
  (select count(*)::int from public.lugares),
  1,
  'sin rol (authenticated): SI ve lugares - policy lugares_select_authenticated'
);

-- 2. veedor ve lugares.
select _as('00000000-0000-0000-0000-0000000000a2');
select is(
  (select count(*)::int from public.lugares),
  1,
  'veedor: ve lugares'
);

-- 3. admin ve lugares.
select _as('00000000-0000-0000-0000-0000000000a1');
select is(
  (select count(*)::int from public.lugares),
  1,
  'admin: ve lugares'
);

-- 4. admin INSERT: lives_ok + trigger fuerza created_by = auth.uid().
select _as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$insert into public.lugares (nombre, created_by)
    values ('Cancha Sur', '00000000-0000-0000-0000-0000000000a2')$$,
  'admin INSERT: lives_ok aunque mande created_by spoofeado'
);

select _as_postgres();
select is(
  (select created_by from public.lugares where nombre = 'Cancha Sur'),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'INSERT: trigger fuerza created_by = auth.uid()'
);

-- 5. veedor NO puede INSERT.
select _as('00000000-0000-0000-0000-0000000000a2');
select throws_like(
  $$insert into public.lugares (nombre, created_by)
    values ('Cancha Este', '00000000-0000-0000-0000-0000000000a2')$$,
  '%row-level security%',
  'veedor NO puede INSERT en lugares'
);

-- 6. sin rol NO puede INSERT.
select _as('00000000-0000-0000-0000-0000000000a3');
select throws_like(
  $$insert into public.lugares (nombre, created_by)
    values ('Cancha Oeste', '00000000-0000-0000-0000-0000000000a3')$$,
  '%row-level security%',
  'sin rol NO puede INSERT en lugares'
);

-- 7. admin UPDATE (rename).
select _as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$update public.lugares set nombre = 'Cancha Norte (renombrada)'
     where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'admin UPDATE: lives_ok'
);

-- 8. veedor NO puede UPDATE (policy filtra fila).
select _as('00000000-0000-0000-0000-0000000000a2');
select is_empty(
  $$update public.lugares set nombre = 'hackeado'
     where id = '00000000-0000-0000-0000-0000000000f1' returning 1$$,
  'veedor NO puede UPDATE (policy filtra)'
);

-- 9. DELETE bloqueado para admin (sin policy de DELETE).
select _as('00000000-0000-0000-0000-0000000000a1');
select is_empty(
  $$delete from public.lugares where id = '00000000-0000-0000-0000-0000000000f1' returning 1$$,
  'admin NO puede DELETE (sin policy)'
);

-- 10. check trim != '' rechaza nombre vacio.
select _as('00000000-0000-0000-0000-0000000000a1');
select throws_like(
  $$insert into public.lugares (nombre, created_by)
    values ('   ', '00000000-0000-0000-0000-0000000000a1')$$,
  '%lugares_nombre_check%',
  'check trim(nombre) != "" rechaza nombre con solo espacios'
);

-- 11. unique case-insensitive rechaza duplicado.
select _as('00000000-0000-0000-0000-0000000000a1');
select throws_like(
  $$insert into public.lugares (nombre, created_by)
    values ('cancha sur', '00000000-0000-0000-0000-0000000000a1')$$,
  '%lugares_nombre_lower_unique%',
  'unique lower(nombre): "cancha sur" choca con "Cancha Sur"'
);

-- 12. cupo_maximo check en convocatorias (10..24).
select _as_postgres();
select throws_like(
  $$insert into public.convocatorias (fecha, hora, cupo_maximo, created_by)
    values (current_date + 1, '20:00', 5, '00000000-0000-0000-0000-0000000000a1')$$,
  '%convocatorias_cupo_maximo_check%',
  'convocatorias.cupo_maximo < 10 rechaza'
);

select * from finish();
rollback;
