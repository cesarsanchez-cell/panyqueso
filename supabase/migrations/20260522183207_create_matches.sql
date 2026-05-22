-- ============================================================================
-- Migracion: matches + match_teams + match_team_players + match_player_stats
-- ============================================================================
--
-- Plan v4 secciones 2/5/7. Modela un partido confirmado a partir de una
-- convocatoria: dos equipos, jugadores asignados, resultado y stats basicas.
--
-- Diseno:
--   - matches:  cabecera del partido, snapshot del balance al confirmar.
--   - match_teams: dos rows por match (A y B) con totales y meta del balance.
--   - match_team_players: jugadores asignados a cada equipo (un row por
--     player + team). Trigger asegura que un mismo player no este en los
--     dos equipos del mismo match.
--   - match_player_stats: data cruda post-partido (goles + notas). Diseno
--     extensible para sumar mas stats sin tocar la tabla.
--
-- balance_snapshot (matches.balance_snapshot jsonb): estructura inmutable
-- post-confirmacion. Contiene jugadores, totales, alertas y la decision
-- humana al confirmar (incluso si fue con confirmed_with_warning=true).
-- Reconstruye la propuesta original del algoritmo aunque despues se ajuste.
--
-- algorithm_version (matches.algorithm_version): persiste la version del
-- algoritmo de balanceo usada (Fase 6: "v1.0" inicial). Permite comparar
-- partidos de distintas versiones.
--
-- RLS: habilitado SIN policies en todas las tablas. Las policies entran en
-- la migracion siguiente (RLS convocatorias/matches): SELECT admin+veedor,
-- INSERT/UPDATE solo admin, DELETE bloqueado.
-- ============================================================================

-- 1. Enums --------------------------------------------------------------------
create type public.match_team_label as enum ('A', 'B');

create type public.match_winner as enum ('a', 'b', 'empate');

-- 2. matches ------------------------------------------------------------------
create table public.matches (
  id          uuid primary key default gen_random_uuid(),

  -- Convocatoria origen. RESTRICT: no permitir borrar la convocatoria si
  -- ya genero un partido (la historia se preserva).
  convocatoria_id  uuid not null
                   references public.convocatorias(id) on delete restrict,

  fecha       date not null,

  -- Snapshot inmutable de la decision al confirmar.
  algorithm_version       text not null default 'v1.0',
  balance_snapshot        jsonb,
  confirmed_with_warning  boolean not null default false,

  -- Resultado del partido (nullable hasta cargar). winner se persiste para
  -- soportar reglas de desempate futuras sin recomputar.
  score_team_a            int,
  score_team_b            int,
  winner                  public.match_winner,
  notas                   text,

  -- Auditoria de confirmacion.
  confirmed_by  uuid references public.profiles(id) on delete set null,
  confirmed_at  timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Coherencia: si hay un score, deben estar ambos.
  constraint matches_scores_complete check (
    (score_team_a is null and score_team_b is null)
    or (score_team_a is not null and score_team_b is not null)
  ),
  constraint matches_scores_nonneg check (
    (score_team_a is null or score_team_a >= 0)
    and (score_team_b is null or score_team_b >= 0)
  )
);

comment on table public.matches is
  'Partido confirmado a partir de una convocatoria. balance_snapshot fija la propuesta del algoritmo al confirmar; los ajustes manuales se reflejan en match_team_players pero no reescriben el snapshot.';
comment on column public.matches.balance_snapshot is
  'Snapshot JSON inmutable: jugadores, scores, alertas y decision humana al confirmar. No se sobreescribe al cargar resultado.';
comment on column public.matches.algorithm_version is
  'Version del algoritmo de balanceo. v1.0 = MVP.';

create index matches_fecha_idx on public.matches (fecha desc);
create index matches_convocatoria_idx on public.matches (convocatoria_id);

-- 3. match_teams --------------------------------------------------------------
create table public.match_teams (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches(id) on delete cascade,

  team_label  public.match_team_label not null,

  -- Totales/meta del equipo segun el balance al confirmar.
  total_score   numeric,
  balance_meta  jsonb,

  created_at  timestamptz not null default now(),

  unique (match_id, team_label)
);

comment on table public.match_teams is
  'Equipo A o B de un match. Dos rows por match. balance_meta JSON: avgs de technical/physical/mental, distribucion de posiciones, etc.';

create index match_teams_match_idx on public.match_teams (match_id);

-- 4. match_team_players -------------------------------------------------------
create table public.match_team_players (
  id              uuid primary key default gen_random_uuid(),

  match_team_id   uuid not null references public.match_teams(id) on delete cascade,

  -- RESTRICT: la historia del partido preserva quien jugo. Las desactivaciones
  -- pasan por player_change_request, no por DELETE de players.
  player_id       uuid not null references public.players(id) on delete restrict,

  assigned_position public.position_pref,
  is_goalkeeper     boolean not null default false,

  created_at  timestamptz not null default now(),

  unique (match_team_id, player_id)
);

comment on table public.match_team_players is
  'Jugadores asignados a cada equipo del match. is_goalkeeper marca el arquero designado (puede ser un field_player en reemplazo segun plan v4).';

create index match_team_players_team_idx
  on public.match_team_players (match_team_id);
create index match_team_players_player_idx
  on public.match_team_players (player_id);

-- 4.b Trigger: un mismo player no puede estar en los dos equipos del mismo match
create or replace function public.match_team_players_no_duplicate_in_match()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_match_id    uuid;
  v_dup_count   int;
begin
  select match_id into v_match_id
  from public.match_teams
  where id = new.match_team_id;

  if v_match_id is null then
    raise exception 'match_team_not_found' using errcode = 'P0040';
  end if;

  select count(*) into v_dup_count
  from public.match_team_players mtp
  join public.match_teams mt on mt.id = mtp.match_team_id
  where mt.match_id = v_match_id
    and mtp.player_id = new.player_id
    and mtp.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if v_dup_count > 0 then
    raise exception 'player_already_in_match'
      using errcode = 'P0041', detail = new.player_id::text;
  end if;

  return new;
end;
$$;

comment on function public.match_team_players_no_duplicate_in_match() is
  'Impide que un player aparezca en los dos equipos del mismo match. P0040 si match_team no existe, P0041 si el player ya esta en el otro equipo.';

revoke all on function public.match_team_players_no_duplicate_in_match() from public;

create trigger match_team_players_no_duplicate_in_match
  before insert or update of player_id, match_team_id on public.match_team_players
  for each row
  execute function public.match_team_players_no_duplicate_in_match();

-- 5. match_player_stats -------------------------------------------------------
create table public.match_player_stats (
  id          uuid primary key default gen_random_uuid(),

  match_id    uuid not null references public.matches(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete restrict,

  goals       int not null default 0 check (goals >= 0),
  notas       text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (match_id, player_id)
);

comment on table public.match_player_stats is
  'Data cruda post-partido (goles + notas). Diseño extensible: nuevas stats se agregan como columnas adicionales sin migrar registros existentes (defaults).';

create index match_player_stats_match_idx
  on public.match_player_stats (match_id);
create index match_player_stats_player_idx
  on public.match_player_stats (player_id);

-- 6. RLS habilitado sin policies (se cierra en la migracion de RLS) ----------
alter table public.matches enable row level security;
alter table public.match_teams enable row level security;
alter table public.match_team_players enable row level security;
alter table public.match_player_stats enable row level security;
