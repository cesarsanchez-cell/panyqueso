-- ============================================================================
-- Fase 10 (Vista jugador v2): equipos confirmados + banco en /mi-perfil
-- ============================================================================
--
-- Cuando el match ya tiene equipos confirmados, el jugador necesita ver SOLO
-- los equipos (no el roster completo de la convocatoria, que es redundante).
-- Pero ademas quiere ver quienes quedaron en el banco: los suplentes que NO
-- entraron como titulares (entran solo si baja alguien).
--
-- Extendemos get_my_confirmed_match_teams para que, ademas de los jugadores
-- de los equipos A/B, devuelva las filas del banco con team_label = NULL.
--   - Equipos: filas con team_label 'A'/'B' (como antes).
--   - Banco: filas con team_label NULL = suplentes no-declinados de la
--     convocatoria origen del match que no estan en ningun equipo.
--
-- El orden de las filas es estable: primero equipo A (arquero arriba, resto
-- por nombre), luego equipo B, luego banco por orden de cola.
--
-- Sigue SOLO devolviendo datos neutrales (label, nombre, apodo, is_goalkeeper);
-- sin scores ni datos internos (ver CLAUDE.md privacidad). SECURITY DEFINER
-- porque matches/* y convocatoria_players son admin+veedor por RLS.
-- ============================================================================
create or replace function public.get_my_confirmed_match_teams()
returns table (
  grupo_id      uuid,
  fecha         date,
  team_label    text,
  player_id     uuid,
  nombre        text,
  apodo         text,
  is_goalkeeper boolean
)
language sql
security definer
set search_path = ''
as $$
  with mis_grupos as (
    select gm.grupo_id
      from public.grupo_membresias gm
     where gm.player_id = public.current_player_id()
       and gm.status = 'activo'
  ),
  -- Proximo match confirmado por grupo: el de menor fecha >= hoy.
  proximo as (
    select distinct on (c.grupo_id)
           c.grupo_id,
           c.id   as convocatoria_id,
           m.id   as match_id,
           m.fecha
      from public.matches m
      join public.convocatorias c on c.id = m.convocatoria_id
     where c.grupo_id in (select grupo_id from mis_grupos)
       and m.fecha >= current_date
     order by c.grupo_id, m.fecha asc
  ),
  -- Jugadores de los equipos A/B.
  equipos as (
    select px.grupo_id,
           px.fecha,
           mt.team_label::text                       as team_label,
           mtp.player_id,
           p.nombre,
           p.apodo,
           mtp.is_goalkeeper,
           0                                          as bucket,
           case mt.team_label when 'A' then 0 else 1 end as ord1,
           (not mtp.is_goalkeeper)::int               as ord2,
           p.nombre                                   as ord3
      from proximo px
      join public.match_teams mt on mt.match_id = px.match_id
      join public.match_team_players mtp on mtp.match_team_id = mt.id
      join public.players p on p.id = mtp.player_id
  ),
  -- Banco: suplentes no-declinados de la convocatoria origen (no entran a un
  -- equipo, esperan en la cola). team_label NULL los distingue.
  banco as (
    select px.grupo_id,
           px.fecha,
           null::text                                 as team_label,
           cp.player_id,
           p.nombre,
           p.apodo,
           false                                      as is_goalkeeper,
           1                                          as bucket,
           0                                          as ord1,
           coalesce(cp.orden_suplente, 0)             as ord2,
           p.nombre                                   as ord3
      from proximo px
      join public.convocatoria_players cp on cp.convocatoria_id = px.convocatoria_id
      join public.players p on p.id = cp.player_id
     where cp.rol_en_convocatoria = 'suplente'
       and cp.attendance_status <> 'declinado'
       and cp.player_id is not null
  )
  select grupo_id, fecha, team_label, player_id, nombre, apodo, is_goalkeeper
    from (
      select * from equipos
      union all
      select * from banco
    ) u
   order by grupo_id, bucket, ord1, ord2, ord3;
$$;

comment on function public.get_my_confirmed_match_teams() is
  'Fase 10: equipos del proximo match confirmado (fecha >= hoy) de cada grupo del jugador + banco (suplentes no-declinados de la conv origen) con team_label NULL. Solo datos neutrales; sin scores ni datos internos. SECURITY DEFINER porque matches/* y convocatoria_players son admin+veedor por RLS.';

revoke all on function public.get_my_confirmed_match_teams() from public;
grant execute on function public.get_my_confirmed_match_teams() to authenticated;
