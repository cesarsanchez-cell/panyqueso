-- ============================================================================
-- cleanup_convocatorias.sql: borra convocatorias SELECTIVAS + todo lo vinculado
-- ============================================================================
--
-- Borra un subconjunto de convocatorias (el que definas en el filtro) y arrastra
-- TODO lo que cuelga de ellas:
--   - matches + match_teams + match_team_players + match_player_stats
--   - convocatoria_players (roster)
--   - las convocatorias en si
--
-- NO toca players, grupos, lugares, profiles ni auth.users.
-- (player_invitations.convocatoria_id queda en NULL solo, por ON DELETE SET NULL:
--  la invitacion no se borra, solo se desvincula.)
--
-- Uso (manual, NO corre con db:push):
--   psql "<DATABASE_URL>" -f scripts/cleanup_convocatorias.sql
--   o pegando el contenido en el SQL editor de Supabase Studio.
--
-- Es destructivo. Editá el filtro del paso 1 antes de correrlo. Por defecto el
-- filtro es `false` => no borra nada (red de seguridad).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. DEFINÍ ACÁ qué convocatorias borrar. Reemplazá el `false` por tu condicion.
--    Ejemplos (descomentá / combiná con AND/OR lo que necesites):
--      c.id = '00000000-0000-0000-0000-000000000000'::uuid          -- una puntual
--      c.id in ('...'::uuid, '...'::uuid)                           -- varias
--      c.grupo_id = '00000000-0000-0000-0000-000000000000'::uuid    -- todas las de un grupo
--      c.status = 'cancelada'                                       -- por estado
--      c.fecha < date '2026-01-01'                                  -- por fecha
-- ----------------------------------------------------------------------------
create temp table objetivo_convs on commit drop as
select c.id
  from public.convocatorias c
 where
   false  -- <<<<<< EDITÁ ESTA LÍNEA. Con `false` no borra nada.
;

-- (Opcional) Para revisar QUÉ vas a borrar, corré esto ANTES y revisá el listado:
--   select id, fecha, status, grupo_id from public.convocatorias
--    where id in (select id from objetivo_convs) order by fecha;

-- ----------------------------------------------------------------------------
-- 2. Matches de esas convocatorias + sus hijos.
--    matches.convocatoria_id es ON DELETE RESTRICT, asi que va primero.
-- ----------------------------------------------------------------------------
create temp table objetivo_matches on commit drop as
select m.id
  from public.matches m
 where m.convocatoria_id in (select id from objetivo_convs);

delete from public.match_player_stats
 where match_id in (select id from objetivo_matches);

delete from public.match_team_players
 where match_team_id in (
   select mt.id from public.match_teams mt
    where mt.match_id in (select id from objetivo_matches)
 );

delete from public.match_teams
 where match_id in (select id from objetivo_matches);

delete from public.matches
 where id in (select id from objetivo_matches);

-- ----------------------------------------------------------------------------
-- 3. Roster y convocatorias.
--    (convocatoria_players es CASCADE, pero lo hacemos explicito por claridad.)
-- ----------------------------------------------------------------------------
delete from public.convocatoria_players
 where convocatoria_id in (select id from objetivo_convs);

delete from public.convocatorias
 where id in (select id from objetivo_convs);

commit;

-- ============================================================================
-- Verificacion rapida tras correr (deberian dar 0 para lo borrado):
--   select count(*) from public.convocatorias where status = 'cancelada';
--   select count(*) from public.matches m
--     left join public.convocatorias c on c.id = m.convocatoria_id
--    where c.id is null;  -- matches huerfanos: deberia ser 0
-- ============================================================================
