-- ============================================================================
-- cleanup_test_group.sql: borra un GRUPO DE PRUEBA entero + todo lo vinculado
-- ============================================================================
--
-- Pensado para limpiar pruebas (ej. probar el Prode / armado de equipos con un
-- grupo y jugadores ficticios) sin dejar basura en la base. Borra, scopeado a UN
-- grupo identificado por NOMBRE:
--   - matches + match_teams + match_team_players + match_player_stats
--     (las APUESTAS del Prode y los VOTOS de figura cuelgan del match con
--      ON DELETE CASCADE, así que se borran solos al borrar el match)
--   - convocatoria_players (roster) + convocatorias
--   - los JUGADORES de prueba: SOLO los que pertenecen a ESTE grupo y a NINGÚN
--     otro, ya sin historial, y que NO sean admin/veedor (+ sus cuentas)
--   - invitaciones del grupo + el grupo en sí
--
-- Salvaguardas:
--   - Si el nombre no matchea ningún grupo, no borra nada (el temp `_g` queda
--     vacío y todos los DELETE filtran por `in (select ... from _g)`).
--   - Un jugador que comparte OTRO grupo, o que tiene convocatoria/partido fuera
--     de este grupo, NO se borra (solo se lo saca de este grupo).
--   - Nunca toca cuentas admin/veedor.
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
  (select count(*) from public.grupo_membresias gm where gm.grupo_id in (select id from g)) as miembros;


-- ----------------------------------------------------------------------------
-- EJECUCIÓN: borra el grupo de prueba y todo lo vinculado. Es destructivo.
-- Poné el MISMO nombre que validaste en el PREVIEW.
-- Seleccioná desde "begin;" hasta "commit;" y corré.
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

-- Jugadores de prueba: SOLO los que están en este grupo y en NINGÚN otro, ya sin
-- historial (lo de arriba ya lo borró), y que no sean admin/veedor.
create temp table _players on commit drop as
select p.id, p.auth_user_id
from public.players p
where exists (
        select 1 from public.grupo_membresias gm
         where gm.player_id = p.id and gm.grupo_id in (select id from _g)
      )
  and not exists (
        select 1 from public.grupo_membresias gm2
         where gm2.player_id = p.id and gm2.grupo_id not in (select id from _g)
      )
  and not exists (select 1 from public.convocatoria_players cp where cp.player_id = p.id)
  and not exists (select 1 from public.match_team_players mtp where mtp.player_id = p.id)
  and not exists (select 1 from public.match_player_stats mps where mps.player_id = p.id)
  and not exists (
        select 1 from public.profiles pr
         where pr.id = p.auth_user_id and pr.role in ('admin', 'veedor')
      );

delete from public.grupo_membresias where player_id in (select id from _players);
delete from public.player_change_requests
 where player_id in (select id from _players)
    or created_player_id in (select id from _players);
update public.player_invitations set used_by_player_id = null
 where used_by_player_id in (select id from _players);
delete from public.players where id in (select id from _players);
delete from public.profiles
 where id in (select auth_user_id from _players where auth_user_id is not null)
   and role not in ('admin', 'veedor');
delete from auth.users
 where id in (select auth_user_id from _players where auth_user_id is not null)
   and id not in (select id from public.profiles where role in ('admin', 'veedor'));

-- Invitaciones del grupo + membresías que hayan quedado (p.ej. tu cuenta admin)
-- + el grupo en sí.
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
-- ----------------------------------------------------------------------------
