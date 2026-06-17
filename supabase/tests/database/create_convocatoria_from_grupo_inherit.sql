-- ============================================================================
-- Tests: create_convocatoria_from_grupo hereda el orden de la última conv
-- ============================================================================
--
-- Cubre:
--   A. Grupo SIN convocatoria previa -> orden natural de alta (joined_at):
--      primeros cupo titulares, resto suplentes FIFO.
--   B. Grupo CON convocatoria previa (orden custom != alta) -> hereda ese
--      orden exacto (titulares/suplentes + orden_suplente), no el de alta.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

-- Admin (a1) -----------------------------------------------------------------
insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'admin-ccfg@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);
update public.profiles set role = 'admin', nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';

-- 16 players con UUID determinista (...01 .. ...10). Sin auth (auth_user_id nullable).
insert into public.players (
  id, nombre, edad, role_field, position_pref, technical, physical, mental, status, created_by
)
select ('00000000-0000-0000-0000-0000000000' || lpad(to_hex(n), 2, '0'))::uuid,
       'P' || n, 30, 'jugador_campo', 'mediocampista', 6, 6, 6, 'approved',
       '00000000-0000-0000-0000-0000000000a1'
  from generate_series(1, 16) n;

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-0000000000aa', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

-- Grupo eA (test A, sin previa) y eB (test B, con previa). cupo 6.
insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo eA', '00000000-0000-0000-0000-0000000000aa', 2, '20:00', 6, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e2', 'Grupo eB', '00000000-0000-0000-0000-0000000000aa', 2, '20:00', 6, '00000000-0000-0000-0000-0000000000a1');

-- Membresias. Todas 'titular' activas (la rama natural ordena por joined_at, no
-- por tipo; titular activo admite orden null). joined_at crece con n.
insert into public.grupo_membresias (grupo_id, player_id, tipo, status, joined_at)
select '00000000-0000-0000-0000-0000000000e1',
       ('00000000-0000-0000-0000-0000000000' || lpad(to_hex(n), 2, '0'))::uuid,
       'titular', 'activo', '2026-01-01 00:00:00+00'::timestamptz + (n || ' minutes')::interval
  from generate_series(1, 8) n;

insert into public.grupo_membresias (grupo_id, player_id, tipo, status, joined_at)
select '00000000-0000-0000-0000-0000000000e2',
       ('00000000-0000-0000-0000-0000000000' || lpad(to_hex(n), 2, '0'))::uuid,
       'titular', 'activo', '2026-01-01 00:00:00+00'::timestamptz + (n || ' minutes')::interval
  from generate_series(9, 16) n;

-- Conv previa de eB (cerrada). Orden CUSTOM != alta: titulares 9,10,11,12,13,16
-- (el 16 promovido, fuera del orden de alta) y suplentes 14(orden1), 15(orden2).
-- Por alta serian titulares 9..14 y suplentes 15,16.
insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date, '20:00', 6, 'cerrada', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1');

insert into public.convocatoria_players (convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000009', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000b', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000c', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000d', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000010', 'confirmado', 'titular',  null),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000e', 'confirmado', 'suplente', 1),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000f', 'confirmado', 'suplente', 2);

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select plan(6);

select _as('00000000-0000-0000-0000-0000000000a1');

-- ===== A. eA sin previa -> orden natural de alta ============================
select lives_ok(
  $$select public.create_convocatoria_from_grupo('00000000-0000-0000-0000-0000000000e1'::uuid, current_date + 7)$$,
  'A: crea la conv de eA (sin previa)'
);

select is(
  (select count(*)::int from public.convocatoria_players cp
     join public.convocatorias c on c.id = cp.convocatoria_id
    where c.grupo_id = '00000000-0000-0000-0000-0000000000e1'
      and c.status = 'abierta'
      and cp.rol_en_convocatoria = 'titular'),
  6,
  'A: 6 titulares (cupo) por orden de alta'
);

-- Por alta, el 7mo y 8vo (joined despues) caen a la lista de espera 1 y 2.
select is(
  (select cp.orden_suplente from public.convocatoria_players cp
     join public.convocatorias c on c.id = cp.convocatoria_id
    where c.grupo_id = '00000000-0000-0000-0000-0000000000e1'
      and c.status = 'abierta'
      and cp.player_id = '00000000-0000-0000-0000-000000000007'),
  1,
  'A: player 7 (alta) es suplente orden 1'
);

-- ===== B. eB con previa -> hereda el orden custom ==========================
select lives_ok(
  $$select public.create_convocatoria_from_grupo('00000000-0000-0000-0000-0000000000e2'::uuid, current_date + 7)$$,
  'B: crea la conv de eB (con previa)'
);

-- player 16 era titular en la última (fuera del orden de alta): debe quedar
-- titular, NO suplente como sugeriría el joined_at.
select is(
  (select cp.rol_en_convocatoria::text from public.convocatoria_players cp
     join public.convocatorias c on c.id = cp.convocatoria_id
    where c.grupo_id = '00000000-0000-0000-0000-0000000000e2'
      and c.status = 'abierta'
      and cp.player_id = '00000000-0000-0000-0000-000000000010'),
  'titular',
  'B: player 16 (titular en la última) se hereda titular, no por alta'
);

-- player 14 era suplente orden 1 en la última: se hereda igual (por alta sería titular).
select is(
  (select cp.orden_suplente from public.convocatoria_players cp
     join public.convocatorias c on c.id = cp.convocatoria_id
    where c.grupo_id = '00000000-0000-0000-0000-0000000000e2'
      and c.status = 'abierta'
      and cp.player_id = '00000000-0000-0000-0000-00000000000e'),
  1,
  'B: player 14 (suplente 1 en la última) se hereda suplente orden 1'
);

select * from finish();
rollback;
