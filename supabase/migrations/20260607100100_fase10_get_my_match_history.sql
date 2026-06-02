-- ============================================================================
-- Fase 10 (Vista jugador v2): historial de partidos del jugador (/historial)
-- ============================================================================
--
-- El jugador quiere ver su historial: partidos que jugo, por grupo, con fecha,
-- resultado y goles. Por ahora con lo que el dato ya permite (matches /
-- match_teams / match_player_stats). "Figura del partido" queda para el modulo
-- de stats completo (no hay columna todavia).
--
-- get_my_match_history() devuelve un row por partido PASADO (fecha < hoy) en el
-- que el jugador estuvo en algun equipo:
--   - grupo (id + nombre)
--   - fecha
--   - team_label del jugador ('A'/'B')
--   - resultado: 'ganado' | 'empate' | 'perdido' | 'sin_resultado'
--   - goles del jugador (0 si no se cargaron)
--
-- Solo datos neutrales/positivos (matches jugados, wins, goles), permitido para
-- vista de jugador por CLAUDE.md. SECURITY DEFINER porque matches/* y
-- match_player_stats son admin+veedor por RLS.
-- ============================================================================
create or replace function public.get_my_match_history()
returns table (
  match_id      uuid,
  grupo_id      uuid,
  grupo_nombre  text,
  fecha         date,
  team_label    text,
  resultado     text,
  goles         int
)
language sql
security definer
set search_path = ''
as $$
  with mi as (
    select public.current_player_id() as pid
  ),
  mis_partidos as (
    select m.id            as match_id,
           c.grupo_id,
           m.fecha,
           mt.team_label::text as team_label,
           m.winner::text   as winner
      from public.match_team_players mtp
      join public.match_teams mt on mt.id = mtp.match_team_id
      join public.matches m on m.id = mt.match_id
      join public.convocatorias c on c.id = m.convocatoria_id
     where mtp.player_id = (select pid from mi)
       and m.fecha < current_date
  )
  select mp.match_id,
         mp.grupo_id,
         g.nombre as grupo_nombre,
         mp.fecha,
         mp.team_label,
         case
           when mp.winner is null then 'sin_resultado'
           when mp.winner = 'empate' then 'empate'
           when (mp.winner = 'a' and mp.team_label = 'A')
             or (mp.winner = 'b' and mp.team_label = 'B') then 'ganado'
           else 'perdido'
         end as resultado,
         coalesce(s.goals, 0) as goles
    from mis_partidos mp
    left join public.grupos g on g.id = mp.grupo_id
    left join public.match_player_stats s
      on s.match_id = mp.match_id and s.player_id = (select pid from mi)
   order by mp.fecha desc;
$$;

comment on function public.get_my_match_history() is
  'Fase 10: historial de partidos PASADOS (fecha < hoy) del jugador autenticado, por grupo, con resultado y goles. Solo datos neutrales/positivos; sin scores internos. SECURITY DEFINER porque matches/* son admin+veedor por RLS.';

revoke all on function public.get_my_match_history() from public;
grant execute on function public.get_my_match_history() to authenticated;
