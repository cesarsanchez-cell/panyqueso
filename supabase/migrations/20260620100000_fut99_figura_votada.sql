-- ============================================================================
-- FUT-99: figura del partido votada por los que jugaron (admin desempata/override)
-- ============================================================================
--
-- Hasta hoy la figura la asignaba a mano el admin (matches.figura_player_id).
-- Ahora la votan LOS QUE JUGARON; la figura resultante = override del admin si
-- lo puso, si no el MAS VOTADO (lider unico). Empate o nadie vota -> el admin
-- resuelve a mano, y puede quedar VACANTE (sin figura) sin problema.
--
-- Ventana de votacion: abre cuando el partido termino (convocatoria 'jugada',
-- resultado cargado) y cierra en el cierre_at de la convocatoria SIGUIENTE del
-- mismo grupo (si no hay proxima todavia, queda abierta). Pasado eso, firme.
--
-- matches.figura_player_id se reinterpreta como el OVERRIDE del admin (sigue
-- usandolo figura-actions). El conteo de votos lo ve SOLO el admin.
-- ============================================================================

create table public.match_figura_votes (
  id                uuid primary key default gen_random_uuid(),
  match_id          uuid not null references public.matches(id) on delete cascade,
  voter_player_id   uuid not null references public.players(id) on delete cascade,
  voted_player_id   uuid not null references public.players(id) on delete cascade,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- 1 voto editable por jugador y por partido.
  unique (match_id, voter_player_id)
);

create index match_figura_votes_match_idx on public.match_figura_votes (match_id);

comment on table public.match_figura_votes is
  'FUT-99: votos de la figura del partido. Votan los que jugaron (auto-voto permitido). Acceso solo via funciones SECURITY DEFINER; RLS sin policies (deny-all directo).';

-- RLS deny-all: todo el acceso pasa por las funciones SECURITY DEFINER de abajo
-- (igual criterio que matches/* admin+veedor). El service-role no usa RLS.
alter table public.match_figura_votes enable row level security;

-- ----------------------------------------------------------------------------
-- _figura_voting_open: ventana de votacion abierta para un match.
--   abre con la convocatoria 'jugada' y cierra en el cierre_at de la proxima
--   convocatoria del mismo grupo (null = no hay proxima -> sigue abierta).
-- ----------------------------------------------------------------------------
create or replace function public._figura_voting_open(p_match_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with m as (
    select c.grupo_id, c.fecha, c.status
      from public.matches mt
      join public.convocatorias c on c.id = mt.convocatoria_id
     where mt.id = p_match_id
  ),
  next_conv as (
    select cc.cierre_at
      from public.convocatorias cc, m
     where cc.grupo_id = m.grupo_id
       and m.grupo_id is not null
       and cc.fecha > m.fecha
     order by cc.fecha asc
     limit 1
  )
  select coalesce((select status from m) = 'jugada', false)
     and (
       (select cierre_at from next_conv) is null
       or now() < (select cierre_at from next_conv)
     );
$$;

-- ----------------------------------------------------------------------------
-- _figura_most_voted: el mas votado del match, o null si no hay votos o empate
--   en el primer lugar.
-- ----------------------------------------------------------------------------
create or replace function public._figura_most_voted(p_match_id uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  with tally as (
    select voted_player_id, count(*) as votos
      from public.match_figura_votes
     where match_id = p_match_id
     group by voted_player_id
  ),
  mx as (select max(votos) as m from tally)
  select case
    when (select m from mx) is null then null
    when (select count(*) from tally where votos = (select m from mx)) > 1 then null
    else (select voted_player_id from tally where votos = (select m from mx))
  end;
$$;

-- ----------------------------------------------------------------------------
-- match_figura_resolved: la figura que ve todo el mundo.
--   = override del admin (matches.figura_player_id) si existe, si no el mas
--     votado (lider unico). null = vacante (empate / nadie voto / sin override).
-- ----------------------------------------------------------------------------
create or replace function public.match_figura_resolved(p_match_id uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    (select figura_player_id from public.matches where id = p_match_id),
    public._figura_most_voted(p_match_id)
  );
$$;

-- ----------------------------------------------------------------------------
-- cast_figura_vote: el jugador logueado (que jugo) vota a otro que jugo.
--   Auto-voto permitido. Upsert (1 voto editable). Solo con la ventana abierta.
-- ----------------------------------------------------------------------------
create or replace function public.cast_figura_vote(p_match_id uuid, p_voted_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_voter uuid := public.current_player_id();
begin
  if v_voter is null then
    raise exception 'no_player' using errcode = 'P0001';
  end if;

  if not public._figura_voting_open(p_match_id) then
    raise exception 'voting_closed' using errcode = 'P0001';
  end if;

  -- el votante tiene que haber jugado ese partido.
  if not exists (
    select 1 from public.match_team_players mtp
      join public.match_teams mt on mt.id = mtp.match_team_id
     where mt.match_id = p_match_id and mtp.player_id = v_voter
  ) then
    raise exception 'voter_not_in_match' using errcode = 'P0001';
  end if;

  -- el votado tambien (auto-voto permitido: v_voter puede == p_voted_player_id).
  if not exists (
    select 1 from public.match_team_players mtp
      join public.match_teams mt on mt.id = mtp.match_team_id
     where mt.match_id = p_match_id and mtp.player_id = p_voted_player_id
  ) then
    raise exception 'voted_not_in_match' using errcode = 'P0001';
  end if;

  insert into public.match_figura_votes (match_id, voter_player_id, voted_player_id)
  values (p_match_id, v_voter, p_voted_player_id)
  on conflict (match_id, voter_player_id)
  do update set voted_player_id = excluded.voted_player_id, updated_at = now();
end;
$$;

-- ----------------------------------------------------------------------------
-- get_figura_candidates: los jugadores que jugaron el partido (para el selector
--   del votante). Solo lo devuelve si quien pregunta jugo ese partido.
-- ----------------------------------------------------------------------------
create or replace function public.get_figura_candidates(p_match_id uuid)
returns table (player_id uuid, nombre text, apodo text, club_id text)
language sql
security definer
set search_path = ''
as $$
  select p.id, p.nombre, p.apodo, p.club_id
    from public.match_team_players mtp
    join public.match_teams mt on mt.id = mtp.match_team_id
    join public.players p on p.id = mtp.player_id
   where mt.match_id = p_match_id
     and exists (
       select 1 from public.match_team_players mtp2
         join public.match_teams mt2 on mt2.id = mtp2.match_team_id
        where mt2.match_id = p_match_id
          and mtp2.player_id = public.current_player_id()
     )
   order by coalesce(nullif(p.apodo, ''), p.nombre);
$$;

-- ----------------------------------------------------------------------------
-- get_figura_votes: conteo de votos por jugador. SOLO admin (el jugador no ve
--   el conteo, solo la figura resultante). Devuelve vacio si no es admin.
-- ----------------------------------------------------------------------------
create or replace function public.get_figura_votes(p_match_id uuid)
returns table (voted_player_id uuid, nombre text, apodo text, votos bigint)
language sql
security definer
set search_path = ''
as $$
  select v.voted_player_id, p.nombre, p.apodo, count(*) as votos
    from public.match_figura_votes v
    join public.players p on p.id = v.voted_player_id
   where v.match_id = p_match_id
     and public.current_user_role() = 'admin'
   group by v.voted_player_id, p.nombre, p.apodo
   order by count(*) desc, coalesce(nullif(p.apodo, ''), p.nombre);
$$;

-- ----------------------------------------------------------------------------
-- get_my_match_history: la figura ahora sale de match_figura_resolved (override
--   ?? mas votado) y agregamos si la votacion esta abierta + a quien voto el
--   jugador, para la UI de /historial.
--   create or replace no permite cambiar columnas de retorno -> drop + create.
-- ----------------------------------------------------------------------------
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
  'Fase 10 / FUT-77/79/80/98/99: historial de partidos PASADOS del jugador. Figura resuelta (override del admin ?? mas votado), si la votacion esta abierta y a quien voto. Sin scores internos. SECURITY DEFINER.';

-- Permisos: todas para authenticated; las internas (_helpers) quedan sin grant
-- a public (las llaman las SECURITY DEFINER, no el cliente).
revoke all on function public.get_my_match_history() from public;
grant execute on function public.get_my_match_history() to authenticated;
revoke all on function public.cast_figura_vote(uuid, uuid) from public;
grant execute on function public.cast_figura_vote(uuid, uuid) to authenticated;
revoke all on function public.get_figura_candidates(uuid) from public;
grant execute on function public.get_figura_candidates(uuid) to authenticated;
revoke all on function public.get_figura_votes(uuid) from public;
grant execute on function public.get_figura_votes(uuid) to authenticated;
revoke all on function public.match_figura_resolved(uuid) from public;
grant execute on function public.match_figura_resolved(uuid) to authenticated;
