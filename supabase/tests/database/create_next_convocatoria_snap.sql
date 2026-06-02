-- ============================================================================
-- Fase 10: la auto-renovacion snapea al dia habitual del grupo
-- ============================================================================
--
-- Si la convocatoria origen cae FUERA del dia del grupo (fecha cargada a mano),
-- create_next_convocatoria NO debe arrastrar el desfase (+7 a ciegas): la
-- siguiente tiene que caer en la proxima ocurrencia de grupos.dia_semana.
--
-- El grupo se configura con dia_semana = (hoy + 2) % 7 y la conv origen en
-- current_date (fuera de ciclo). La siguiente debe caer 2 dias despues (en el
-- dia del grupo), no a +7.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'admin-snap@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin', nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000a1';

insert into public.lugares (id, nombre, created_by) values
  ('00000000-0000-0000-0000-00000000000a', 'Cancha', '00000000-0000-0000-0000-0000000000a1');

-- Grupo con dia_semana = (hoy + 2) % 7 (un dia distinto al de hoy).
insert into public.grupos (id, nombre, lugar_id, dia_semana, hora, cupo_titulares, owner_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'Grupo e1', '00000000-0000-0000-0000-00000000000a',
   ((extract(dow from current_date)::int + 2) % 7), '20:00', 6, '00000000-0000-0000-0000-0000000000a1');

-- Conv origen FUERA de ciclo: fecha = hoy (no es el dia del grupo).
insert into public.convocatorias (id, fecha, hora, cupo_maximo, status, grupo_id, created_by) values
  ('00000000-0000-0000-0000-0000000000c1', current_date, '20:00', 6, 'cerrada',
   '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1');

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select plan(3);

select _as('00000000-0000-0000-0000-0000000000a1');

select lives_ok(
  $$select public.create_next_convocatoria('00000000-0000-0000-0000-0000000000c1'::uuid)$$,
  'admin: create_next_convocatoria corre sin error'
);

-- La siguiente cae en el dia habitual del grupo (no a +7).
select is(
  (select extract(dow from fecha)::int
     from public.convocatorias
    where grupo_id = '00000000-0000-0000-0000-0000000000e1'
      and status = 'abierta'),
  ((extract(dow from current_date)::int + 2) % 7),
  'la siguiente cae en el dia habitual del grupo'
);

-- Y es la PROXIMA ocurrencia: 2 dias despues de la origen (dentro de la semana).
select is(
  (select fecha
     from public.convocatorias
    where grupo_id = '00000000-0000-0000-0000-0000000000e1'
      and status = 'abierta'),
  (current_date + 2),
  'la siguiente es la proxima ocurrencia (origen + 2 dias), no +7'
);

select * from finish();
rollback;
