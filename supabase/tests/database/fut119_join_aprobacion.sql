-- ============================================================================
-- FUT-119 (Fase 13 / F1): gate de aprobación opcional del link /g
-- ============================================================================
--   1.  claim en grupo que requiere aprobación → corre sin error.
--   2.  el player queda PENDING (no approved).
--   3.  NO se crea membresía (no se cuela en convocatorias).
--   4.  queda una solicitud pendiente.
--   5.  listar_join_requests (como admin) devuelve la solicitud.
--   6.  aprobar_join_request corre sin error.
--   7.  tras aprobar, el player queda approved.
--   8.  tras aprobar, hay membresía activa.
--   9.  la solicitud queda 'aprobada'.
--   10. otro joiner + rechazar → el player queda inactive.
--   11. un no-gestor que intenta aprobar → P0013.
--
-- Nota: grupo_join_requests tiene RLS deny-all (acceso solo por RPC). Por eso las
-- aserciones que leen la tabla directo corren como superuser (reset role), y los
-- RPCs gateados se llaman con _as(<uuid>).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000',
   'admin-apr@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000',
   'joiner-apr1@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000',
   'joiner-apr2@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-000000000000',
   'nogestor@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin', nombre = 'Admin Apr' where id = '00000000-0000-0000-0000-0000000000c1';

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000c', 'Cancha Apr', '00000000-0000-0000-0000-0000000000c1');

insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id, status, join_token, join_requiere_aprobacion) values
  ('00000000-0000-0000-0000-00000000cc01', 'Grupo Apr', '00000000-0000-0000-0000-00000000000c', 2, '20:00', 10,
   '00000000-0000-0000-0000-0000000000c1', 'activo', 'tok_aprob_123456789012', true);

create or replace function _as(p_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select plan(11);

-- ---- Joiner 1: alta en grupo con aprobación requerida (superuser) ----------
select lives_ok(
  $$ select public.claim_group_join(
       'tok_aprob_123456789012',
       '00000000-0000-0000-0000-0000000000c2',
       '+5491155551001', 'Pendiente Uno',
       '1995-05-05'::date, 30,
       'jugador_campo'::public.player_role_field, 'delantero'::public.position_pref
     ) $$,
  'claim en grupo con aprobación corre sin error');

select is(
  (select status::text from public.players where phone = '+5491155551001'),
  'pending', 'el player queda pending');

select is(
  (select count(*)::int from public.grupo_membresias gm
     join public.players p on p.id = gm.player_id
    where p.phone = '+5491155551001'),
  0, 'no se crea membresía mientras está pendiente');

select is(
  (select count(*)::int from public.grupo_join_requests r
     join public.players p on p.id = r.player_id
    where p.phone = '+5491155551001' and r.status = 'pendiente'),
  1, 'queda una solicitud pendiente');

-- ---- Admin: ve y aprueba (RPCs gateados) -----------------------------------
select _as('00000000-0000-0000-0000-0000000000c1');

select is(
  (select count(*)::int from public.listar_join_requests('00000000-0000-0000-0000-00000000cc01')),
  1, 'listar_join_requests devuelve la solicitud al admin');

select lives_ok(
  $$ select public.aprobar_join_request(
       (select r.id from public.grupo_join_requests r
          join public.players p on p.id = r.player_id
         where p.phone = '+5491155551001' and r.status = 'pendiente')
     ) $$,
  'aprobar_join_request corre sin error');

reset role;

select is(
  (select status::text from public.players where phone = '+5491155551001'),
  'approved', 'tras aprobar, el player queda approved');

select is(
  (select gm.status::text from public.grupo_membresias gm
     join public.players p on p.id = gm.player_id
    where p.phone = '+5491155551001'),
  'activo', 'tras aprobar, hay membresía activa');

select is(
  (select r.status::text from public.grupo_join_requests r
     join public.players p on p.id = r.player_id
    where p.phone = '+5491155551001'),
  'aprobada', 'la solicitud queda aprobada');

-- ---- Joiner 2: alta + rechazo ----------------------------------------------
select public.claim_group_join(
  'tok_aprob_123456789012',
  '00000000-0000-0000-0000-0000000000c3',
  '+5491155551002', 'Pendiente Dos',
  '1992-02-02'::date, 33,
  'jugador_campo'::public.player_role_field, 'defensor'::public.position_pref
);

select _as('00000000-0000-0000-0000-0000000000c1');
select public.rechazar_join_request(
  (select r.id from public.grupo_join_requests r
     join public.players p on p.id = r.player_id
    where p.phone = '+5491155551002' and r.status = 'pendiente'));
reset role;

select is(
  (select status::text from public.players where phone = '+5491155551002'),
  'inactive', 'tras rechazar, el player queda inactive');

-- ---- Gate: un no-gestor no puede aprobar (P0013) ---------------------------
create temporary table _gate_req on commit drop as
  select id from public.grupo_join_requests
   where grupo_id = '00000000-0000-0000-0000-00000000cc01' limit 1;

select _as('00000000-0000-0000-0000-0000000000c4');
select throws_ok(
  $$ select public.aprobar_join_request((select id from _gate_req)) $$,
  'P0013', null, 'un no-gestor no puede aprobar (P0013)');

select * from finish();
rollback;
