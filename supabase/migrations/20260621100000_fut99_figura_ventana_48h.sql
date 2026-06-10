-- ============================================================================
-- FUT-99 (ajuste): ventana de votacion fija de 48h + figura revelada al cerrar
-- ============================================================================
--
-- La version anterior (20260620100000) abria con la conv 'jugada' y cerraba en
-- la proxima convocatoria (~1 semana) y revelaba al lider EN VIVO. Eso pierde la
-- gracia: se ve un ganador provisorio con 1 voto y la espera es larguisima.
--
-- Nuevo modelo (decidido con el usuario, 2026-06-10):
--   - Ventana FIJA: abre apenas el partido termino (por reloj = fecha + hora de
--     la convocatoria) y cierra 48h despues. Desacoplado del resultado.
--   - La figura se REVELA recien al cerrar la votacion (suspenso / "premiacion").
--     Mientras esta abierta, el jugador no ve el lider provisorio.
--   - El override del admin (matches.figura_player_id) SI se muestra apenas se
--     pone (decision explicita), abierta o cerrada.
--
-- FIGURA_VENTANA = 48h. Es la unica perilla; cambiar el interval de abajo.
-- ============================================================================

-- closes_at = (fecha + hora del partido) + 48h. null si no existe el match.
create or replace function public._figura_voting_closes_at(p_match_id uuid)
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  select (c.fecha + c.hora)::timestamptz + interval '48 hours'
    from public.matches mt
    join public.convocatorias c on c.id = mt.convocatoria_id
   where mt.id = p_match_id;
$$;

-- Abierta = ya empezo (now >= fecha+hora) y todavia no pasaron las 48h.
create or replace function public._figura_voting_open(p_match_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with w as (
    select (c.fecha + c.hora)::timestamptz as opens_at
      from public.matches mt
      join public.convocatorias c on c.id = mt.convocatoria_id
     where mt.id = p_match_id
  )
  select coalesce(
    now() >= (select opens_at from w)
      and now() < (select opens_at from w) + interval '48 hours',
    false
  );
$$;

-- Figura resuelta (la que ven los jugadores):
--   = override del admin si lo puso (se muestra siempre, abierta o cerrada);
--   si no, el mas votado PERO solo una vez que la votacion CERRO (revelado).
--   Mientras esta abierta y sin override -> null (no se revela el provisorio).
create or replace function public.match_figura_resolved(p_match_id uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    (select figura_player_id from public.matches where id = p_match_id),
    case
      when now() >= public._figura_voting_closes_at(p_match_id)
        then public._figura_most_voted(p_match_id)
      else null
    end
  );
$$;

-- get_my_match_history: ahora tambien devuelve cuando cierra la votacion, para
-- mostrarle al jugador "cierra el [fecha/hora]". create or replace no permite
-- cambiar columnas de retorno -> drop + create.
drop function if exists public.get_my_match_history();

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
  'Fase 10 / FUT-77/79/80/98/99: historial PASADO del jugador. Figura revelada al CERRAR la votacion (48h desde fecha+hora del partido) o override del admin. Devuelve si la votacion esta abierta, cuando cierra y a quien voto. Sin scores internos. SECURITY DEFINER.';

revoke all on function public.get_my_match_history() from public;
grant execute on function public.get_my_match_history() to authenticated;
revoke all on function public._figura_voting_closes_at(uuid) from public;
grant execute on function public._figura_voting_closes_at(uuid) to authenticated;
