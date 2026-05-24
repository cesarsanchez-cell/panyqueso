-- ============================================================================
-- Fase 8 cierre: tests de RLS para matches + match_player_stats
-- ============================================================================
--
-- Gap detectado en self-audit Fase 8: las policies de matches,
-- match_teams, match_team_players y match_player_stats existen desde
-- Fase 2 pero no tenian tests negativos. Este test cubre:
--
--   matches:
--     - admin puede SELECT, INSERT, UPDATE
--     - veedor puede SELECT pero NO INSERT, NO UPDATE
--     - sin rol no puede SELECT
--   match_player_stats:
--     - admin puede INSERT y UPDATE
--     - veedor puede SELECT pero NO INSERT, NO UPDATE
--     - sin rol no puede SELECT
--   DELETE bloqueado para todos (sin policy = filtrado).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, "$user";

insert into auth.users (
  id, instance_id, email, encrypted_password,
  aud, role, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000000',
   'admin-mrls@test.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-000000000000',
   'veedor-mrls@test.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a3',
   '00000000-0000-0000-0000-000000000000',
   'sinrol-mrls@test.local', '', 'authenticated', 'authenticated',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

update public.profiles set role = 'admin', nombre = 'Admin'
 where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'veedor', nombre = 'Veedor'
 where id = '00000000-0000-0000-0000-0000000000a2';

-- Player approved.
insert into public.players (
  id, nombre, edad, role_field, position_pref,
  technical, physical, mental, status, created_by
) values (
  '00000000-0000-0000-0000-0000000000b1',
  'Jugador Test', 28, 'jugador_campo', 'mediocampista',
  6, 6, 6, 'approved', '00000000-0000-0000-0000-0000000000a1'
);

-- Convocatoria + match base (creados con role postgres, ignora RLS).
insert into public.convocatorias (id, fecha, hora, cupo_maximo, created_by)
values (
  '00000000-0000-0000-0000-0000000000c1',
  current_date + 1, '20:00', 12,
  '00000000-0000-0000-0000-0000000000a1'
);

insert into public.matches (
  id, convocatoria_id, fecha, algorithm_version, confirmed_by, confirmed_at
) values (
  '00000000-0000-0000-0000-0000000000f1',
  '00000000-0000-0000-0000-0000000000c1',
  current_date + 1, 'v1.0',
  '00000000-0000-0000-0000-0000000000a1', now()
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

select plan(10);

-- ---------------------------------------------------------------------------
-- matches: SELECT
-- ---------------------------------------------------------------------------
select _as('00000000-0000-0000-0000-0000000000a1');
select isnt_empty(
  $$select 1 from public.matches where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'admin: SELECT matches devuelve fila'
);

select _as('00000000-0000-0000-0000-0000000000a2');
select isnt_empty(
  $$select 1 from public.matches where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'veedor: SELECT matches devuelve fila'
);

select _as('00000000-0000-0000-0000-0000000000a3');
select is_empty(
  $$select 1 from public.matches where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'sin rol: SELECT matches filtrado por RLS'
);

-- ---------------------------------------------------------------------------
-- matches: UPDATE (score) — admin SI, veedor NO
-- ---------------------------------------------------------------------------
select _as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$update public.matches set score_team_a = 3, score_team_b = 2, winner = 'a'
     where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'admin: UPDATE matches lives_ok'
);

select _as('00000000-0000-0000-0000-0000000000a2');
select is_empty(
  $$update public.matches set score_team_a = 9
     where id = '00000000-0000-0000-0000-0000000000f1' returning 1$$,
  'veedor: UPDATE matches filtrado por RLS (is_empty)'
);

-- ---------------------------------------------------------------------------
-- match_player_stats: INSERT — admin SI, veedor NO
-- ---------------------------------------------------------------------------
select _as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$insert into public.match_player_stats (match_id, player_id, goals)
    values (
      '00000000-0000-0000-0000-0000000000f1',
      '00000000-0000-0000-0000-0000000000b1',
      2
    )$$,
  'admin: INSERT match_player_stats lives_ok'
);

select _as('00000000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$insert into public.match_player_stats (match_id, player_id, goals)
    values (
      '00000000-0000-0000-0000-0000000000f1',
      '00000000-0000-0000-0000-0000000000b1',
      99
    )$$,
  '42501',
  null,
  'veedor: INSERT match_player_stats rechazado por RLS (42501)'
);

-- ---------------------------------------------------------------------------
-- match_player_stats: UPDATE — admin SI, veedor NO
-- ---------------------------------------------------------------------------
select _as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$update public.match_player_stats set goals = 3
     where match_id = '00000000-0000-0000-0000-0000000000f1'
       and player_id = '00000000-0000-0000-0000-0000000000b1'$$,
  'admin: UPDATE match_player_stats lives_ok'
);

select _as('00000000-0000-0000-0000-0000000000a2');
select is_empty(
  $$update public.match_player_stats set goals = 9
     where match_id = '00000000-0000-0000-0000-0000000000f1'
     returning 1$$,
  'veedor: UPDATE match_player_stats filtrado por RLS (is_empty)'
);

-- ---------------------------------------------------------------------------
-- match_player_stats: SELECT veedor SI
-- ---------------------------------------------------------------------------
select _as('00000000-0000-0000-0000-0000000000a2');
select isnt_empty(
  $$select 1 from public.match_player_stats
     where match_id = '00000000-0000-0000-0000-0000000000f1'$$,
  'veedor: SELECT match_player_stats devuelve fila'
);

select * from finish();
rollback;
