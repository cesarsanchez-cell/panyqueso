-- ============================================================================
-- cleanup_test_group.sql: borra un GRUPO DE PRUEBA + sus partidos/convocatorias
-- ============================================================================
--
-- Pensado para limpiar pruebas (ej. probar el Prode / armado de equipos con un
-- grupo ficticio) sin dejar basura. Borra, scopeado a UN grupo por NOMBRE:
--   - matches + match_teams + match_team_players + match_player_stats
--     (las APUESTAS del Prode y los VOTOS de figura cuelgan del match con
--      ON DELETE CASCADE, así que se borran solos al borrar el match)
--   - convocatoria_players (roster) + convocatorias
--   - invitaciones del grupo
--   - membresías del grupo (saca a los jugadores DEL GRUPO) + el grupo en sí
--
-- IMPORTANTE: **NO borra jugadores ni sus cuentas.** Solo elimina las MEMBRESÍAS
-- (los desvincula del grupo). Los registros de `players` / `profiles` /
-- `auth.users` quedan intactos. Si además querés borrar jugadores ficticios,
-- usá `prune_players.sql` (por lista de celulares) DESPUÉS de correr esto.
--
-- Salvaguarda: si el nombre no matchea ningún grupo, no borra nada (el temp `_g`
-- queda vacío y todos los DELETE filtran por `in (select ... from _g)`).
--
-- Uso (manual, NO corre con db:push): pegá esto en el SQL Editor de Supabase.
--   1) PREVIEW  -> reemplazá el nombre y corré para ver qué borraría (read-only).
--   2) EJECUCIÓN -> el MISMO nombre; seleccioná de "begin;" a "commit;" y corré.
-- Es destructivo.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PREVIEW (read-only): cuánto borraría para ese nombre de grupo.
-- Reemplazá 'NOMBRE DEL GRUPO DE PRUEBA' por el nombre exacto.
-- ----------------------------------------------------------------------------
with g as (
  select id, nombre from public.grupos where nombre = 'NOMBRE DEL GRUPO DE PRUEBA'
)
select
  (select count(*) from public.convocatorias c where c.grupo_id in (select id from g))      as convocatorias,
  (select count(*) from public.matches m
     join public.convocatorias c on c.id = m.convocatoria_id
    where c.grupo_id in (select id from g))                                                 as matches,
  (select count(*) from public.match_prode_predictions pr
     join public.matches m on m.id = pr.match_id
     join public.convocatorias c on c.id = m.convocatoria_id
    where c.grupo_id in (select id from g))                                                 as apuestas_prode,
  (select count(*) from public.grupo_membresias gm where gm.grupo_id in (select id from g)) as membresias_a_sacar;


-- ----------------------------------------------------------------------------
-- EJECUCIÓN: borra el grupo de prueba, sus partidos/convocatorias y desvincula
-- a los jugadores (NO los borra). Es destructivo. Poné el MISMO nombre que
-- validaste en el PREVIEW. Seleccioná desde "begin;" hasta "commit;" y corré.
-- ----------------------------------------------------------------------------
begin;

create temp table _g on commit drop as
select id from public.grupos where nombre = 'NOMBRE DEL GRUPO DE PRUEBA';

create temp table _convs on commit drop as
select id from public.convocatorias where grupo_id in (select id from _g);

create temp table _matches on commit drop as
select id from public.matches where convocatoria_id in (select id from _convs);

-- Hijos del match. matches.convocatoria_id es ON DELETE RESTRICT -> el match va
-- antes que la convocatoria. Al borrar el match cascadean match_prode_predictions
-- y match_figura_votes.
delete from public.match_player_stats where match_id in (select id from _matches);
delete from public.match_team_players
 where match_team_id in (
   select mt.id from public.match_teams mt where mt.match_id in (select id from _matches)
 );
delete from public.match_teams where match_id in (select id from _matches);
delete from public.matches where id in (select id from _matches);

-- Roster + convocatorias.
delete from public.convocatoria_players where convocatoria_id in (select id from _convs);
delete from public.convocatorias where id in (select id from _convs);

-- Invitaciones del grupo + membresías (desvincula a los jugadores, NO los borra)
-- + el grupo en sí. Los registros de players/profiles/auth.users quedan intactos.
delete from public.player_invitations where grupo_id in (select id from _g);
delete from public.grupo_membresias where grupo_id in (select id from _g);
delete from public.grupos where id in (select id from _g);

commit;


-- ----------------------------------------------------------------------------
-- Verificación rápida tras correr (todo debería dar 0 para el grupo borrado):
--   select count(*) from public.grupos where nombre = 'NOMBRE DEL GRUPO DE PRUEBA';
--   select count(*) from public.matches m
--     left join public.convocatorias c on c.id = m.convocatoria_id
--    where c.id is null;  -- matches huérfanos: 0
-- Los jugadores siguen existiendo (sin este grupo):
--   select nombre, phone, status from public.players order by nombre;
-- ----------------------------------------------------------------------------
