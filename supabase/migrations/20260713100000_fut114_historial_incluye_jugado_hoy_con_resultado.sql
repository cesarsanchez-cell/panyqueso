-- ============================================================================
-- FUT-114: "Mi actividad" muestra el partido jugado HOY apenas tiene resultado
-- ============================================================================
--
-- Bug: get_my_match_history usaba `m.fecha < current_date` como proxy de "ya se
-- jugó". Un partido jugado HOY (o cuyo resultado se carga antes de que la fecha
-- quede en el pasado) no aparecía hasta el día siguiente. El jugador con varios
-- grupos no lo notaba (lo tapaban partidos viejos); el que tiene UN solo grupo
-- y cuyo único partido era el de hoy veía "Mi actividad" vacío.
--
-- Fix: un partido entra al historial si su fecha ya pasó O si ya tiene resultado
-- cargado (winner no nulo). Así:
--   - un partido con resultado aparece enseguida, el mismo día, para todos los
--     que jugaron;
--   - un partido viejo sin resultado sigue apareciendo como 'sin_resultado';
--   - un partido futuro/de hoy todavía sin jugar (sin resultado) sigue oculto.
--
-- Solo cambia el WHERE del CTE mis_partidos; el resto de get_my_match_history
-- queda igual (mismas columnas -> create or replace).
-- ============================================================================

create or replace function public.get_my_match_history()
returns table (
  match_id                 uuid,
  grupo_id                 uuid,
  grupo_nombre             text,
  fecha                    date,
  team_label               text,
  resultado                text,
  goles                    int,
  asistencias              int,
  goles_en_contra          int,
  video_resumen_url        text,
  figura_nombre            text,
  figura_es_mia            boolean,
  figura_votacion_abierta  boolean,
  figura_votacion_cierra   timestamptz,
  mi_voto_player_id        uuid
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
           m.winner::text   as winner,
           m.video_resumen_url
      from public.match_team_players mtp
      join public.match_teams mt on mt.id = mtp.match_team_id
      join public.matches m on m.id = mt.match_id
      join public.convocatorias c on c.id = m.convocatoria_id
     where mtp.player_id = (select pid from mi)
       -- Ya jugado: fecha pasada O resultado cargado (no esperar al día siguiente).
       and (m.fecha < current_date or m.winner is not null)
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
         coalesce(s.goals, 0) as goles,
         coalesce(s.asistencias, 0) as asistencias,
         coalesce(s.own_goals, 0) as goles_en_contra,
         mp.video_resumen_url,
         coalesce(nullif(fp.apodo, ''), fp.nombre) as figura_nombre,
         (rf.fig is not null and rf.fig = (select pid from mi)) as figura_es_mia,
         public._figura_voting_open(mp.match_id) as figura_votacion_abierta,
         public._figura_voting_closes_at(mp.match_id) as figura_votacion_cierra,
         (select v.voted_player_id
            from public.match_figura_votes v
           where v.match_id = mp.match_id
             and v.voter_player_id = (select pid from mi)) as mi_voto_player_id
    from mis_partidos mp
    left join public.grupos g on g.id = mp.grupo_id
    left join public.match_player_stats s
      on s.match_id = mp.match_id and s.player_id = (select pid from mi)
    left join lateral (select public.match_figura_resolved(mp.match_id) as fig) rf on true
    left join public.players fp on fp.id = rf.fig
   order by mp.fecha desc;
$$;

comment on function public.get_my_match_history() is
  'Fase 10 / FUT-77/79/80/98/99/114: historial PASADO del jugador. Un partido entra si su fecha ya pasó O ya tiene resultado cargado (winner no nulo) — así el partido jugado HOY aparece el mismo día. Figura revelada al cerrar la votación (48h desde fecha+hora) o por override del admin. Sin scores internos. SECURITY DEFINER.';

revoke all on function public.get_my_match_history() from public;
grant execute on function public.get_my_match_history() to authenticated;
