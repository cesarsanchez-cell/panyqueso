-- ============================================================================
-- FUT-98: goles en contra (autogoles) como stat del jugador
-- ============================================================================
--
-- "Gol en contra" = autogol: el jugador la mete en su propio arco, suma para el
-- rival. match_player_stats ya guarda goles y asistencias por jugador; sumamos
-- own_goals con el mismo diseno extensible (columna nueva con default, no migra
-- los registros existentes).
--
-- (1) match_player_stats.own_goals: entero >= 0, default 0. La carga el admin
--     junto con goles/asistencias (mismo form / upsert).
-- (2) get_my_match_history devuelve los goles en contra del jugador por partido.
--     Decision de producto (override consciente de la regla "nada negativo al
--     jugador", 2026-06-10): en el grupo de amigos el gol en contra es dato de
--     joda, asi que SI se muestra en el carne. Sigue sin exponer scores internos.
--     create or replace no permite cambiar columnas de retorno -> drop + create.
-- ============================================================================

alter table public.match_player_stats
  add column own_goals int not null default 0 check (own_goals >= 0);

comment on column public.match_player_stats.own_goals is
  'FUT-98: goles en contra (autogoles) del jugador en el partido. >= 0. Lo carga el admin junto con los goles. Suma para el rival.';

-- ----------------------------------------------------------------------------
-- get_my_match_history: suma los goles en contra del jugador por partido.
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
  goles_en_contra   int,
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
         coalesce(s.own_goals, 0) as goles_en_contra,
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
  'Fase 10 / FUT-80 / FUT-77 / FUT-79 / FUT-98: historial de partidos PASADOS (fecha < hoy) del jugador autenticado, por grupo, con resultado, goles, asistencias, goles en contra, link al video y figura del partido. Sin scores internos. SECURITY DEFINER porque matches/* son admin+veedor por RLS.';

revoke all on function public.get_my_match_history() from public;
grant execute on function public.get_my_match_history() to authenticated;
