-- ============================================================================
-- cleanup.sql: resetea el estado operativo preservando solo admin + veedor
-- ============================================================================
--
-- Borra todos los datos operativos (players, grupos, lugares, convocatorias,
-- matches, change requests, invitaciones, audit log). Preserva las cuentas
-- auth.users y profiles cuyo role es 'admin' o 'veedor'.
--
-- Uso (NO se corre con db:push, es manual):
--   psql "<DATABASE_URL>" -f scripts/cleanup.sql
--   o desde supabase studio SQL editor pegando el contenido.
--
-- Es destructivo. Hacelo con calma.
-- ============================================================================

begin;

-- Tablas con FKs hacia players/convocatorias/grupos. Borrar primero las
-- dependientes para no chocar con RESTRICT.

-- Matches y sus hijos.
delete from public.match_player_stats;
delete from public.match_team_players;
delete from public.match_teams;
delete from public.matches;

-- Convocatorias y su roster.
delete from public.convocatoria_players;
delete from public.convocatorias;

-- Membresias y grupos.
delete from public.grupo_membresias;
delete from public.grupos;

-- Invitaciones a registro.
delete from public.player_invitations;

-- Change requests sobre players.
delete from public.player_change_requests;

-- Audit log: lo limpiamos tambien para no dejar referencias colgadas.
delete from public.audit_log;

-- Players (catalogo entero).
delete from public.players;

-- Lugares (catalogo entero).
delete from public.lugares;

-- Profiles que NO son admin ni veedor.
delete from public.profiles
 where role not in ('admin', 'veedor');

-- auth.users de las cuentas que ya no tienen profile admin/veedor.
-- profiles.id ES el auth.users.id (FK directo, no hay columna user_id).
delete from auth.users
 where id not in (
   select id from public.profiles where role in ('admin', 'veedor')
 );

commit;

-- Verificacion rapida tras correr el script:
--   select count(*) from auth.users;  -- deberia ser = cant de admins+veedores
--   select role, count(*) from public.profiles group by role;
--   select count(*) from public.players;  -- 0
--   select count(*) from public.grupos;   -- 0
--   select count(*) from public.lugares;  -- 0
--   select count(*) from public.convocatorias;  -- 0
