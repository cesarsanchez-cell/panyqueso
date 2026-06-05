-- ============================================================================
-- prune_players.sql: limpieza selectiva de jugadores segun participacion
-- ============================================================================
--
-- Regla:
--   * Jugador que NUNCA estuvo en una convocatoria  -> se BORRA (y su cuenta).
--   * Jugador que SI estuvo en al menos una          -> se INHABILITA
--                                                       (status = 'inactive').
--
-- "Estuvo en una convocatoria" = tiene fila en convocatoria_players. Por las
-- dudas tambien se preservan (no se borran) los que aparezcan en un partido
-- (match_team_players / match_player_stats / figura), aunque eso implica que
-- tuvieron convocatoria.
--
-- NO toca admin ni veedor. NO toca grupos, lugares ni convocatorias salvo las
-- filas que referencian a los jugadores que se borran.
--
-- Uso (NO se corre con db:push, es manual):
--   psql "<DATABASE_URL>" -f scripts/prune_players.sql
--   o pegando el contenido en el SQL editor de Supabase Studio.
--
-- Es destructivo. Antes corré el bloque PREVIEW para ver cuántos caen en cada
-- grupo. Si el número cierra, ejecutá la transacción.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PREVIEW (read-only, no modifica nada). Corré esto primero.
-- ----------------------------------------------------------------------------
select
  count(*) filter (where not tuvo_conv)                          as a_borrar,
  count(*) filter (where tuvo_conv and status <> 'inactive')     as a_inhabilitar,
  count(*) filter (where tuvo_conv and status = 'inactive')      as ya_inhabilitados
from (
  select
    p.status,
    exists (
      select 1 from public.convocatoria_players cp where cp.player_id = p.id
    ) as tuvo_conv
  from public.players p
) x;

-- Detalle de los que se borrarían (revisalo antes de ejecutar):
select p.id, p.nombre, p.phone, p.status
  from public.players p
 where not exists (select 1 from public.convocatoria_players cp where cp.player_id = p.id)
   and not exists (select 1 from public.match_team_players mtp where mtp.player_id = p.id)
   and not exists (select 1 from public.match_player_stats mps where mps.player_id = p.id)
   and not exists (select 1 from public.matches m where m.figura_player_id = p.id)
 order by p.nombre;

-- ----------------------------------------------------------------------------
-- EJECUCIÓN. Corré este bloque cuando el preview cierre.
-- ----------------------------------------------------------------------------
begin;

-- 1) Inhabilitar a los que SÍ tuvieron al menos una convocatoria.
update public.players p
   set status = 'inactive',
       updated_at = now()
 where p.status <> 'inactive'
   and exists (
         select 1 from public.convocatoria_players cp where cp.player_id = p.id
       );

-- 2) Conjunto a BORRAR: jugadores sin ninguna participación. Se materializa en
--    una temp table para reusarlo en cada delete sin recalcular.
create temporary table _prune_players on commit drop as
select p.id, p.auth_user_id
  from public.players p
 where not exists (select 1 from public.convocatoria_players cp where cp.player_id = p.id)
   and not exists (select 1 from public.match_team_players mtp where mtp.player_id = p.id)
   and not exists (select 1 from public.match_player_stats mps where mps.player_id = p.id)
   and not exists (select 1 from public.matches m where m.figura_player_id = p.id);

-- 2a) Dependientes que apuntan a esos players (van antes por las FKs).
delete from public.grupo_membresias
 where player_id in (select id from _prune_players);

delete from public.player_change_requests
 where player_id in (select id from _prune_players)
    or created_player_id in (select id from _prune_players);

-- La invitación se conserva como registro; solo se desvincula del player borrado.
update public.player_invitations
   set used_by_player_id = null
 where used_by_player_id in (select id from _prune_players);

-- 2b) Borrar los players.
delete from public.players
 where id in (select id from _prune_players);

-- 2c) Cuentas de esos jugadores (role 'player'). profiles.id = auth.users.id.
--     Nunca toca admin/veedor.
delete from public.profiles
 where id in (select auth_user_id from _prune_players where auth_user_id is not null)
   and role not in ('admin', 'veedor');

delete from auth.users
 where id in (select auth_user_id from _prune_players where auth_user_id is not null)
   and id not in (
     select id from public.profiles where role in ('admin', 'veedor')
   );

commit;

-- ----------------------------------------------------------------------------
-- Verificación rápida tras ejecutar:
--   -- no debería quedar ningún jugador sin convocatoria:
--   select count(*) from public.players p
--     where not exists (select 1 from public.convocatoria_players cp
--                        where cp.player_id = p.id);  -- 0
--   -- los que quedan con convocatoria deberían estar inactivos:
--   select status, count(*) from public.players group by status;
-- ----------------------------------------------------------------------------
