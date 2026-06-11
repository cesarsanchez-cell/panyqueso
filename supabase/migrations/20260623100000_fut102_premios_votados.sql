-- ============================================================================
-- FUT-102: premios votados — El Carnicero 🔪 + El Pinocho 🪵 (F1: DB)
-- ============================================================================
--
-- Suma DOS premios votados AL LADO de la figura (MVP ⭐, FUT-99), reusando su
-- motor: misma ventana (48h desde fecha+hora del partido, `_figura_voting_open`),
-- mismos candidatos (los que jugaron, `get_figura_candidates`), mismo patrón de
-- "votan los que jugaron + admin desempata + se revela al cerrar".
--
-- Decisiones (con el usuario, 2026-06-11):
--   - 🔪 Carnicero (el más rudo): va para TODOS los grupos.
--   - 🪵 Pinocho (el peor): OPT-IN por grupo (`grupos.premio_pinocho`, default
--     false), porque es un voto negativo y choca con la regla de privacidad.
--     Tono de joda; el admin de cada grupo decide si lo prende.
--   - La figura/MVP queda intacta (su propia tabla y funciones); esto es aparte.
--
-- match_award_votes es la tabla generalizada (`categoria`). El override/desempate
-- del admin vive en columnas nuevas de matches (espejo de figura_player_id).
-- RLS deny-all + acceso por funciones SECURITY DEFINER.
-- ============================================================================

create type public.award_category as enum ('carnicero', 'pinocho');

create table public.match_award_votes (
  id                uuid primary key default gen_random_uuid(),
  match_id          uuid not null references public.matches(id) on delete cascade,
  categoria         public.award_category not null,
  voter_player_id   uuid not null references public.players(id) on delete cascade,
  voted_player_id   uuid not null references public.players(id) on delete cascade,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- 1 voto editable por jugador, por partido y por categoría.
  unique (match_id, categoria, voter_player_id)
);

create index match_award_votes_match_idx on public.match_award_votes (match_id, categoria);

comment on table public.match_award_votes is
  'FUT-102: votos de premios (carnicero/pinocho). Votan los que jugaron (auto-voto permitido). Acceso solo via funciones SECURITY DEFINER; RLS deny-all. La figura/MVP es aparte (match_figura_votes).';

alter table public.match_award_votes enable row level security;

-- Override / desempate del admin por categoría (espejo de matches.figura_player_id).
alter table public.matches
  add column carnicero_player_id uuid references public.players(id) on delete set null,
  add column pinocho_player_id   uuid references public.players(id) on delete set null;

-- Opt-in del Pinocho por grupo (el Carnicero no se configura: va siempre).
alter table public.grupos
  add column premio_pinocho boolean not null default false;

comment on column public.grupos.premio_pinocho is
  'FUT-102: si el grupo habilita el premio 🪵 Pinocho (peor jugador). Default false (opt-in) porque es un voto negativo.';

-- ----------------------------------------------------------------------------
-- _award_most_voted: el más votado de una categoría en un match, o null si no
--   hay votos o hay empate en el primer lugar. (Espejo de _figura_most_voted.)
-- ----------------------------------------------------------------------------
create or replace function public._award_most_voted(
  p_match_id uuid, p_categoria public.award_category
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  with tally as (
    select voted_player_id, count(*) as votos
      from public.match_award_votes
     where match_id = p_match_id and categoria = p_categoria
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
-- match_award_resolved: el ganador de una categoría que ven los jugadores.
--   = override del admin (matches.<cat>_player_id) si lo puso (se muestra
--     siempre); si no, el más votado PERO solo una vez que la votación CERRÓ
--     (revelado). Reusa la ventana de 48h de la figura.
-- ----------------------------------------------------------------------------
create or replace function public.match_award_resolved(
  p_match_id uuid, p_categoria public.award_category
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    case p_categoria
      when 'carnicero' then (select carnicero_player_id from public.matches where id = p_match_id)
      when 'pinocho'   then (select pinocho_player_id   from public.matches where id = p_match_id)
    end,
    case
      when now() >= public._figura_voting_closes_at(p_match_id)
        then public._award_most_voted(p_match_id, p_categoria)
      else null
    end
  );
$$;

-- ----------------------------------------------------------------------------
-- cast_award_vote: el jugador logueado (que jugó) vota a otro que jugó, en una
--   categoría. Auto-voto permitido. Upsert (1 voto editable por categoría).
--   Solo con la ventana abierta. Pinocho requiere que el grupo lo tenga prendido.
-- ----------------------------------------------------------------------------
create or replace function public.cast_award_vote(
  p_match_id uuid, p_categoria public.award_category, p_voted_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_voter uuid := public.current_player_id();
  v_grupo uuid;
begin
  if v_voter is null then
    raise exception 'no_player' using errcode = 'P0001';
  end if;

  if not public._figura_voting_open(p_match_id) then
    raise exception 'voting_closed' using errcode = 'P0001';
  end if;

  -- Pinocho: solo si el grupo del partido lo tiene habilitado.
  if p_categoria = 'pinocho' then
    select c.grupo_id into v_grupo
      from public.matches mt
      join public.convocatorias c on c.id = mt.convocatoria_id
     where mt.id = p_match_id;
    if not coalesce((select premio_pinocho from public.grupos where id = v_grupo), false) then
      raise exception 'award_disabled' using errcode = 'P0001';
    end if;
  end if;

  -- El votante tiene que haber jugado ese partido.
  if not exists (
    select 1 from public.match_team_players mtp
      join public.match_teams mt on mt.id = mtp.match_team_id
     where mt.match_id = p_match_id and mtp.player_id = v_voter
  ) then
    raise exception 'voter_not_in_match' using errcode = 'P0001';
  end if;

  -- El votado también (auto-voto permitido).
  if not exists (
    select 1 from public.match_team_players mtp
      join public.match_teams mt on mt.id = mtp.match_team_id
     where mt.match_id = p_match_id and mtp.player_id = p_voted_player_id
  ) then
    raise exception 'voted_not_in_match' using errcode = 'P0001';
  end if;

  insert into public.match_award_votes (match_id, categoria, voter_player_id, voted_player_id)
  values (p_match_id, p_categoria, v_voter, p_voted_player_id)
  on conflict (match_id, categoria, voter_player_id)
  do update set voted_player_id = excluded.voted_player_id, updated_at = now();
end;
$$;

-- ----------------------------------------------------------------------------
-- get_award_votes: conteo de votos por jugador para una categoría. SOLO admin
--   (el jugador solo ve el ganador resultante). (Espejo de get_figura_votes.)
-- ----------------------------------------------------------------------------
create or replace function public.get_award_votes(
  p_match_id uuid, p_categoria public.award_category
)
returns table (voted_player_id uuid, nombre text, apodo text, votos bigint)
language sql
security definer
set search_path = ''
as $$
  select v.voted_player_id, p.nombre, p.apodo, count(*) as votos
    from public.match_award_votes v
    join public.players p on p.id = v.voted_player_id
   where v.match_id = p_match_id and v.categoria = p_categoria
     and public.current_user_role() = 'admin'
   group by v.voted_player_id, p.nombre, p.apodo
   order by count(*) desc, coalesce(nullif(p.apodo, ''), p.nombre);
$$;

-- ----------------------------------------------------------------------------
-- get_my_match_awards: estado de los premios (carnicero/pinocho) de los partidos
--   PASADOS que jugó el jugador logueado, para la UI de /historial. Mismo
--   conjunto que get_my_match_history; se mergea por match_id. No toca la figura.
-- ----------------------------------------------------------------------------
create or replace function public.get_my_match_awards()
returns table (
  match_id            uuid,
  carnicero_nombre    text,
  mi_voto_carnicero   uuid,
  pinocho_habilitado  boolean,
  pinocho_nombre      text,
  mi_voto_pinocho     uuid
)
language sql
security definer
set search_path = ''
as $$
  with mi as (select public.current_player_id() as pid),
  mis_partidos as (
    select distinct m.id as match_id, c.grupo_id
      from public.match_team_players mtp
      join public.match_teams mt on mt.id = mtp.match_team_id
      join public.matches m on m.id = mt.match_id
      join public.convocatorias c on c.id = m.convocatoria_id
     where mtp.player_id = (select pid from mi)
       and m.fecha < current_date
  )
  select mp.match_id,
         coalesce(nullif(cp.apodo, ''), cp.nombre) as carnicero_nombre,
         (select v.voted_player_id from public.match_award_votes v
           where v.match_id = mp.match_id and v.categoria = 'carnicero'
             and v.voter_player_id = (select pid from mi)) as mi_voto_carnicero,
         coalesce(g.premio_pinocho, false) as pinocho_habilitado,
         coalesce(nullif(pp.apodo, ''), pp.nombre) as pinocho_nombre,
         (select v.voted_player_id from public.match_award_votes v
           where v.match_id = mp.match_id and v.categoria = 'pinocho'
             and v.voter_player_id = (select pid from mi)) as mi_voto_pinocho
    from mis_partidos mp
    left join public.grupos g on g.id = mp.grupo_id
    left join lateral (select public.match_award_resolved(mp.match_id, 'carnicero') as r) rc on true
    left join public.players cp on cp.id = rc.r
    left join lateral (select public.match_award_resolved(mp.match_id, 'pinocho') as r) rp on true
    left join public.players pp on pp.id = rp.r;
$$;

-- ----------------------------------------------------------------------------
-- Permisos: públicas a authenticated; _award_most_voted queda interna.
-- ----------------------------------------------------------------------------
revoke all on function public.cast_award_vote(uuid, public.award_category, uuid) from public;
grant execute on function public.cast_award_vote(uuid, public.award_category, uuid) to authenticated;
revoke all on function public.match_award_resolved(uuid, public.award_category) from public;
grant execute on function public.match_award_resolved(uuid, public.award_category) to authenticated;
revoke all on function public.get_award_votes(uuid, public.award_category) from public;
grant execute on function public.get_award_votes(uuid, public.award_category) to authenticated;
revoke all on function public.get_my_match_awards() from public;
grant execute on function public.get_my_match_awards() to authenticated;
