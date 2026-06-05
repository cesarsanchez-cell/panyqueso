-- ============================================================================
-- prune_players.sql: limpieza selectiva de jugadores (por celular)
-- ============================================================================
--
-- El BORRADO se maneja con una LISTA DE CELULARES que vos editás: se borran
-- SOLO los jugadores cuyos celulares pongas en la lista (el celular es la clave
-- única: 1 cel = 1 jugador). Así no dependés de ningún heurístico y borrás
-- exactamente a quien corresponde.
--
-- Salvaguarda: si un celular de la lista pertenece a un jugador que SÍ tuvo
-- convocatoria (o jugó un partido), NO se borra (borrarlo destruiría historial).
-- Para esos casos está el bloque OPCIONAL de "inhabilitar" al final.
--
-- Uso (manual, NO corre con db:push): pegá esto en el SQL Editor de Supabase
-- y corré bloque por bloque seleccionando el texto + Ctrl/Cmd+Enter.
--
-- Orden sugerido:
--   1) PREVIEW A  -> ver todos los jugadores con su celular (para copiar).
--   2) Editar la lista de celulares (en PREVIEW B y en EJECUCIÓN, la misma).
--   3) PREVIEW B  -> validar qué haría con tu lista (read-only).
--   4) EJECUCIÓN  -> borra. Es destructivo.
--   5) (opcional) INHABILITAR a los que tuvieron convocatoria.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PREVIEW A (read-only): todos los jugadores con su celular tal como está
-- guardado. Copiá de acá los celulares que querés borrar.
-- ----------------------------------------------------------------------------
select
  p.nombre,
  p.phone,
  p.status,
  exists (select 1 from public.convocatoria_players cp where cp.player_id = p.id) as tuvo_conv,
  p.id
from public.players p
order by tuvo_conv, p.nombre;


-- ----------------------------------------------------------------------------
-- PREVIEW B (read-only): validá tu lista ANTES de ejecutar.
-- Editá los celulares de abajo (uno por línea, como aparecen en PREVIEW A).
-- Ignora espacios, guiones y paréntesis; respeta el prefijo +54 9 si lo tienen.
-- ----------------------------------------------------------------------------
with borrar(phone_in) as (
  values
    ('+5491111111111'),   -- <- reemplazá por celulares reales
    ('+5492222222222')    -- <- agregá / quitá líneas según necesites
)
select
  b.phone_in,
  p.nombre,
  p.status,
  exists (select 1 from public.convocatoria_players cp where cp.player_id = p.id) as tuvo_conv,
  case
    when p.id is null then '❌ no existe ese celular'
    when exists (select 1 from public.convocatoria_players cp where cp.player_id = p.id)
         then '⚠️ tuvo convocatoria: NO se borra (usá INHABILITAR)'
    when exists (select 1 from public.match_team_players mtp where mtp.player_id = p.id)
      or exists (select 1 from public.match_player_stats mps where mps.player_id = p.id)
      or exists (select 1 from public.matches m where m.figura_player_id = p.id)
         then '⚠️ jugó un partido: NO se borra'
    else '✅ se borra'
  end as accion
from borrar b
left join public.players p
  on regexp_replace(coalesce(p.phone, ''), '[^0-9+]', '', 'g')
   = regexp_replace(b.phone_in, '[^0-9+]', '', 'g')
order by accion, p.nombre;


-- ----------------------------------------------------------------------------
-- EJECUCIÓN: borra SOLO los jugadores de la lista (que no tengan historial).
-- Pegá ACÁ LA MISMA lista de celulares que validaste en PREVIEW B.
-- Seleccioná desde "begin;" hasta "commit;" y corré.
-- ----------------------------------------------------------------------------
begin;

create temporary table _borrar_phones (phone_in text) on commit drop;
insert into _borrar_phones (phone_in) values
  ('+5491111111111'),   -- <- la MISMA lista que en PREVIEW B
  ('+5492222222222');

-- Resuelve la lista de celulares a jugadores borrables (sin historial).
create temporary table _to_delete on commit drop as
select p.id, p.auth_user_id
from public.players p
join _borrar_phones b
  on regexp_replace(coalesce(p.phone, ''), '[^0-9+]', '', 'g')
   = regexp_replace(b.phone_in, '[^0-9+]', '', 'g')
where not exists (select 1 from public.convocatoria_players cp where cp.player_id = p.id)
  and not exists (select 1 from public.match_team_players mtp where mtp.player_id = p.id)
  and not exists (select 1 from public.match_player_stats mps where mps.player_id = p.id)
  and not exists (select 1 from public.matches m where m.figura_player_id = p.id);

-- Dependientes que apuntan a esos players (van antes por las FKs).
delete from public.grupo_membresias
 where player_id in (select id from _to_delete);

delete from public.player_change_requests
 where player_id in (select id from _to_delete)
    or created_player_id in (select id from _to_delete);

-- La invitación se conserva como registro; solo se desvincula del player borrado.
update public.player_invitations
   set used_by_player_id = null
 where used_by_player_id in (select id from _to_delete);

-- Borrar los players.
delete from public.players
 where id in (select id from _to_delete);

-- Cuentas de esos jugadores (role 'player'). profiles.id = auth.users.id.
-- Nunca toca admin/veedor.
delete from public.profiles
 where id in (select auth_user_id from _to_delete where auth_user_id is not null)
   and role not in ('admin', 'veedor');

delete from auth.users
 where id in (select auth_user_id from _to_delete where auth_user_id is not null)
   and id not in (
     select id from public.profiles where role in ('admin', 'veedor')
   );

commit;


-- ----------------------------------------------------------------------------
-- (OPCIONAL) INHABILITAR a TODOS los que tuvieron al menos una convocatoria.
-- Reversible (status = 'inactive'). Descomentá y corré si lo querés.
-- ----------------------------------------------------------------------------
-- update public.players p
--    set status = 'inactive',
--        updated_at = now()
--  where p.status <> 'inactive'
--    and exists (
--          select 1 from public.convocatoria_players cp where cp.player_id = p.id
--        );


-- ----------------------------------------------------------------------------
-- Verificación rápida tras ejecutar:
--   select status, count(*) from public.players group by status;
--   -- confirmá que los celulares borrados ya no aparezcan:
--   -- select nombre, phone from public.players order by nombre;
-- ----------------------------------------------------------------------------
