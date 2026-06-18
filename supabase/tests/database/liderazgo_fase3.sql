-- ============================================================================
-- Tests: liderazgo 3 estados + confianza 'inicial' (Fase 3)
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

-- Auth: admin (a1) + player (a2)
insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000',
   'admin-f3@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000',
   'player-f3@test.local', '', 'authenticated', 'authenticated', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin',  nombre = 'Admin' where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set role = 'player', nombre = 'P'     where id = '00000000-0000-0000-0000-0000000000c2';

create or replace function _as(p_id uuid)
returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated')::text, true);
end;
$$;

select plan(11);

-- 1. El enum liderazgo_nivel tiene exactamente negativo/ninguno/positivo.
select set_eq(
  $$select unnest(enum_range(null::public.liderazgo_nivel))::text$$,
  array['negativo', 'ninguno', 'positivo'],
  'liderazgo_nivel = negativo/ninguno/positivo'
);

-- 2. La confianza tiene 'inicial'.
select ok(
  'inicial' = any (enum_range(null::public.rating_confidence)::text[]),
  'rating_confidence incluye inicial'
);

-- 3. Coeficientes default 1.00.
select is(
  (select liderazgo_coef_positivo from public.app_settings where id), 1.00,
  'coef positivo default 1.00'
);
select is(
  (select liderazgo_coef_negativo from public.app_settings where id), 1.00,
  'coef negativo default 1.00'
);

-- 4. Admin ajusta los coeficientes (positivo ≥1, negativo ≤1).
select _as('00000000-0000-0000-0000-0000000000c1');
select lives_ok(
  $$select public.set_liderazgo_coeficientes(1.30, 0.85)$$,
  'admin: set_liderazgo_coeficientes corre'
);
reset role;
select is(
  (select liderazgo_coef_negativo from public.app_settings where id), 0.85,
  'coef negativo persistido'
);

-- 5. Negativo fuera de rango (>1) → error.
select _as('00000000-0000-0000-0000-0000000000c1');
select throws_ok(
  $$select public.set_liderazgo_coeficientes(1.30, 1.20)$$,
  'P0001',
  null,
  'coef negativo > 1.00 rechazado'
);
reset role;

-- 6. No-admin → P0013.
select _as('00000000-0000-0000-0000-0000000000c2');
select throws_ok(
  $$select public.set_liderazgo_coeficientes(1.10, 0.90)$$,
  'P0013',
  null,
  'no-admin: set_liderazgo_coeficientes lanza P0013'
);
reset role;

-- 7. Confianza: alta sin especificar → default 'inicial'.
insert into public.players (id, nombre, edad, role_field, position_pref, positions_possible,
  technical, physical, mental, status, created_by)
values ('00000000-0000-0000-0000-0000000000f1', 'Nuevo', 28, 'jugador_campo', 'mediocampista',
  array['mediocampista']::public.position_pref[], 6, 6, 6, 'approved',
  '00000000-0000-0000-0000-0000000000c1');
select is(
  (select rating_confidence::text from public.players where id = '00000000-0000-0000-0000-0000000000f1'),
  'inicial',
  'alta sin confianza → inicial (default)'
);

-- 8. Confianza: alta con 'baja' (sentinel viejo) → trigger lo pasa a 'inicial'.
insert into public.players (id, nombre, edad, role_field, position_pref, positions_possible,
  technical, physical, mental, rating_confidence, status, created_by)
values ('00000000-0000-0000-0000-0000000000f2', 'Conbaja', 28, 'jugador_campo', 'mediocampista',
  array['mediocampista']::public.position_pref[], 6, 6, 6, 'baja', 'approved',
  '00000000-0000-0000-0000-0000000000c1');
select is(
  (select rating_confidence::text from public.players where id = '00000000-0000-0000-0000-0000000000f2'),
  'inicial',
  'alta con baja → inicial (trigger)'
);

-- 9. Confianza: alta con 'media' → queda 'media' (no la toca el trigger).
insert into public.players (id, nombre, edad, role_field, position_pref, positions_possible,
  technical, physical, mental, rating_confidence, status, created_by)
values ('00000000-0000-0000-0000-0000000000f3', 'Conmedia', 28, 'jugador_campo', 'mediocampista',
  array['mediocampista']::public.position_pref[], 6, 6, 6, 'media', 'approved',
  '00000000-0000-0000-0000-0000000000c1');
select is(
  (select rating_confidence::text from public.players where id = '00000000-0000-0000-0000-0000000000f3'),
  'media',
  'alta con media → media (intacto)'
);

select * from finish();
rollback;
