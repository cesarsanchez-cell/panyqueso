-- ============================================================================
-- FUT-89: la columna players.club_id existe y acepta NULL / slug
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-000000000000',
   'admin-club@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin', nombre = 'Admin Club' where id = '00000000-0000-0000-0000-0000000000fa';

insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by, club_id
) values
  ('00000000-0000-0000-0000-0000000000ba', 'Hincha', 30, 'jugador_campo', 'delantero', 5, 5, 5, 'approved', '00000000-0000-0000-0000-0000000000fa', 'boca');

select plan(2);

select has_column('public', 'players', 'club_id', 'players.club_id existe');

select is(
  (select club_id from public.players where id = '00000000-0000-0000-0000-0000000000ba'),
  'boca',
  'club_id guarda el slug del club'
);

select * from finish();
rollback;
