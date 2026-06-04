-- ============================================================================
-- FUT-79: asistencias (pases de gol) como stat del jugador
-- ============================================================================
--
-- "Asistencia" = pase que termina en gol (assist), NO presentismo. match_player_stats
-- ya guarda goles por jugador; sumamos asistencias con el mismo diseno extensible
-- (columna nueva con default, no migra los registros existentes).
--
-- (1) match_player_stats.asistencias: entero >= 0, default 0. La carga la hace el
--     admin junto con los goles (mismo form / upsert).
-- (2) get_my_match_history devuelve las asistencias del jugador por partido, para
--     mostrarlas en su historial y sumarlas en el panel de actividad. Es dato
--     positivo/neutral -> permitido en la vista del jugador (CLAUDE.md).
--     create or replace no permite cambiar columnas de retorno -> drop + create.
-- ============================================================================

alter table public.match_player_stats
  add column asistencias int not null default 0 check (asistencias >= 0);

comment on column public.match_player_stats.asistencias is
  'FUT-79: pases de gol (assists) del jugador en el partido. >= 0. Lo carga el admin junto con los goles.';

-- ----------------------------------------------------------------------------
-- get_my_match_history: suma asistencias del jugador por partido.
-- ----------------------------------------------------------------------------
drop function if exists public.get_my_match_history();

create or replace function public.get_my_match_history()
returns table (
  match_id          uuid,
  grupo_id          uuid,
  grupo_nombre      text,
  fecha             date,
  team_label        text,
  resultado         text,
  goles             int,
  asistencias       int,
  video_resumen_url text,
  figura_nombre     text,
  figura_es_mia     boolean
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
           m.video_resumen_url,
           m.figura_player_id
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
         coalesce(s.goals, 0) as goles,
         coalesce(s.asistencias, 0) as asistencias,
         mp.video_resumen_url,
         coalesce(nullif(fp.apodo, ''), fp.nombre) as figura_nombre,
         (mp.figura_player_id is not null
           and mp.figura_player_id = (select pid from mi)) as figura_es_mia
    from mis_partidos mp
    left join public.grupos g on g.id = mp.grupo_id
    left join public.match_player_stats s
      on s.match_id = mp.match_id and s.player_id = (select pid from mi)
    left join public.players fp on fp.id = mp.figura_player_id
   order by mp.fecha desc;
$$;

comment on function public.get_my_match_history() is
  'Fase 10 / FUT-80 / FUT-77 / FUT-79: historial de partidos PASADOS (fecha < hoy) del jugador autenticado, por grupo, con resultado, goles, asistencias, link al video y figura del partido. Solo datos neutrales/positivos; sin scores internos. SECURITY DEFINER porque matches/* son admin+veedor por RLS.';

revoke all on function public.get_my_match_history() from public;
grant execute on function public.get_my_match_history() to authenticated;
