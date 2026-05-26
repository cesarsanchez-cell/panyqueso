-- ============================================================================
-- backfill_grupo_membresias.sql
-- ============================================================================
--
-- Heredado del bug previo al fix de addPlayer: jugadores agregados manualmente
-- por el admin a una convocatoria sin pasar por grupo_membresias. Quedaron
-- huerfanos en convocatoria_players, lo que rompe la visibilidad via
-- players_public (otros players del grupo los ven como "—" en /mi-perfil).
--
-- Esta query asegura una membresia activa en el grupo de cada convocatoria
-- para todo player que aparezca en su roster. Idempotente: ON CONFLICT
-- preserva los rows ya existentes.
--
-- Uso (manual, no se corre con db:push):
--   psql "<DATABASE_URL>" -f scripts/backfill_grupo_membresias.sql
--   o desde Supabase Studio SQL editor.
-- ============================================================================

begin;

insert into public.grupo_membresias (grupo_id, player_id, tipo, orden, status)
select distinct
  c.grupo_id,
  cp.player_id,
  'titular'::public.membresia_tipo,
  null::int,
  'activo'::public.membresia_status
  from public.convocatoria_players cp
  join public.convocatorias c on c.id = cp.convocatoria_id
 where cp.player_id is not null
   and c.grupo_id is not null
   and not exists (
     select 1 from public.grupo_membresias gm
      where gm.grupo_id = c.grupo_id
        and gm.player_id = cp.player_id
   );

-- Reactivar membresias que estaban inactivas pero el player sigue en algun
-- roster de una conv del grupo (caso: admin lo bajo del grupo y despues lo
-- volvio a meter manualmente en una conv).
update public.grupo_membresias gm
   set status = 'activo',
       inactivated_at = null,
       inactivated_by = null
 where status <> 'activo'
   and exists (
     select 1
       from public.convocatoria_players cp
       join public.convocatorias c on c.id = cp.convocatoria_id
      where cp.player_id = gm.player_id
        and c.grupo_id = gm.grupo_id
   );

commit;

-- Verificacion:
--   select count(*) from public.convocatoria_players cp
--    join public.convocatorias c on c.id = cp.convocatoria_id
--   where cp.player_id is not null
--     and c.grupo_id is not null
--     and not exists (
--       select 1 from public.grupo_membresias gm
--        where gm.grupo_id = c.grupo_id
--          and gm.player_id = cp.player_id
--          and gm.status = 'activo'
--     );
-- (deberia dar 0)
