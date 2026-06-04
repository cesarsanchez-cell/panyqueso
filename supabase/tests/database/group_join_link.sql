-- ============================================================================
-- Tests del link único de grupo (join_token + claim_group_join)
-- ============================================================================
--
-- Cubre:
--   1. La columna grupos.join_token existe.
--   2. get_group_by_join_token devuelve el grupo activo por token.
--   3. get_group_by_join_token NO devuelve grupos archivados.
--   4. claim_group_join corre sin error.
--   5. claim_group_join crea el player como approved.
--   6. claim_group_join crea la membresía activa (titular, hay cupo).
--   7. claim_group_join con un teléfono ya existente => error P0024.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

-- Auth users: admin (owner), un joiner nuevo, y otro para la colisión.
insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000',
   'admin-join@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000',
   'joiner@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-000000000000',
   'joiner2@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin', nombre = 'Admin Join' where id = '00000000-0000-0000-0000-0000000000d1';

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000d', 'Cancha Join', '00000000-0000-0000-0000-0000000000d1');

-- Grupo activo con token y un grupo archivado con token.
insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id, status, join_token) values
  ('00000000-0000-0000-0000-00000000ab01', 'Grupo Join', '00000000-0000-0000-0000-00000000000d', 2, '20:00', 10, '00000000-0000-0000-0000-0000000000d1', 'activo',    'tok_activo_1234567890'),
  ('00000000-0000-0000-0000-00000000ab02', 'Grupo Arch', '00000000-0000-0000-0000-00000000000d', 3, '21:00', 10, '00000000-0000-0000-0000-0000000000d1', 'archivado', 'tok_archivado_123456');

select plan(7);

-- 1. Columna existe.
select has_column('public', 'grupos', 'join_token', 'grupos.join_token existe');

-- 2. Lookup público devuelve el grupo activo.
select is(
  (select grupo_nombre from public.get_group_by_join_token('tok_activo_1234567890')),
  'Grupo Join',
  'get_group_by_join_token: devuelve el grupo activo'
);

-- 3. Grupo archivado no se expone.
select is(
  (select count(*)::int from public.get_group_by_join_token('tok_archivado_123456')),
  0,
  'get_group_by_join_token: grupo archivado no aparece'
);

-- 4. claim_group_join crea el player approved (corre sin error).
select lives_ok(
  $$ select public.claim_group_join(
       'tok_activo_1234567890',
       '00000000-0000-0000-0000-0000000000d2',
       '+5491155550001',
       'Nuevo Jugador',
       '1995-05-05'::date,
       30,
       'jugador_campo'::public.player_role_field,
       'delantero'::public.position_pref
     ) $$,
  'claim_group_join: corre sin error'
);

select is(
  (select status::text from public.players where phone = '+5491155550001'),
  'approved',
  'claim_group_join: player queda approved'
);

-- 6. Membresía activa creada en el grupo (titular, hay cupo).
select is(
  (select gm.tipo::text || ':' || gm.status::text
     from public.grupo_membresias gm
     join public.players p on p.id = gm.player_id
    where p.phone = '+5491155550001'
      and gm.grupo_id = '00000000-0000-0000-0000-00000000ab01'),
  'titular:activo',
  'claim_group_join: membresía titular activa'
);

-- 7. Teléfono ya registrado => P0024.
select throws_ok(
  $$ select public.claim_group_join(
       'tok_activo_1234567890',
       '00000000-0000-0000-0000-0000000000d3',
       '+5491155550001',
       'Repetido',
       '1990-01-01'::date,
       35,
       'jugador_campo'::public.player_role_field,
       'defensor'::public.position_pref
     ) $$,
  'P0024',
  null,
  'claim_group_join: teléfono duplicado dispara P0024'
);

select * from finish();
rollback;
