-- ============================================================================
-- FUT-103 (Fase 11, Bloque 1, 1a): ratings POR GRUPO — player_group_ratings
-- ============================================================================
--
-- El rating deja de ser global: un mismo jugador (1 celular) puede rendir
-- distinto en cada grupo (F11 vs F5), y cada coordinador lo califica con su
-- impronta — a la MISMA granularidad que el admin: los 9 sub-ratings del
-- scoring v2 (FUT-85/86). El acceso real (RPC + gate del veedor por grupo) va
-- en 1b (FUT-104) y la UI en 1c (FUT-105).
--
-- Decisiones (con el usuario, 2026-06-11):
--   - Tabla DEDICADA por (player_id, grupo_id), estable: sobrevive al churn de
--     grupo_membresias (el rating del grupo se conserva ante re-ingresos).
--   - El coordinador califica con los 9 SUB-RATINGS (igual que el admin). Las
--     dimensiones técnica/físico/mental se DERIVAN (promedio de sus 3 subs) y
--     el internal_score se calcula REUSANDO public.compute_internal_score_v2()
--     (físico_efectivo×0.35 + mental×0.325 + técnica×0.325, escalones de edad).
--     Cero duplicación de fórmula → el score del grupo queda idéntico al base.
--   - `edad` queda GLOBAL en players; los subs + rol/posición difieren por grupo.
--   - players.* (subs + dims + rol/posición) quedan como BASE/SEMILLA.
--   - Rating inicial al entrar a un grupo nuevo = COPIADO de la base.
--   - Poblado a futuro = TRIGGER auto-crea la fila al agregar la membresía
--     (no se sobrescribe si ya existe).
--
-- RLS: SELECT admin+veedor (como players). INSERT/UPDATE/DELETE bloqueados para
-- clientes; solo triggers SECURITY DEFINER y las funciones de 1b modifican.
--
-- Idempotente: drops al inicio para poder re-correr sobre una versión previa.
-- ============================================================================

drop trigger if exists grupo_membresias_seed_group_rating       on public.grupo_membresias;
drop trigger if exists players_recompute_group_scores_on_edad   on public.players;
drop function if exists public.grupo_membresias_seed_rating()             cascade;
drop function if exists public.player_group_ratings_recompute_on_edad()   cascade;
drop function if exists public.player_group_ratings_set_score()           cascade;
drop table    if exists public.player_group_ratings                       cascade;

-- 1. Tabla -------------------------------------------------------------------
create table public.player_group_ratings (
  id                  uuid primary key default gen_random_uuid(),
  player_id           uuid not null references public.players(id) on delete cascade,
  grupo_id            uuid not null references public.grupos(id)  on delete cascade,

  -- Fuente de verdad: los 9 sub-ratings v2 (1–10), igual que players.
  phys_power          int not null check (phys_power      between 1 and 10),
  phys_speed          int not null check (phys_speed      between 1 and 10),
  phys_stamina        int not null check (phys_stamina    between 1 and 10),
  ment_tactical       int not null check (ment_tactical   between 1 and 10),
  ment_resilience     int not null check (ment_resilience between 1 and 10),
  ment_attitude       int not null check (ment_attitude   between 1 and 10),
  tech_passing        int not null check (tech_passing    between 1 and 10),
  tech_finishing      int not null check (tech_finishing  between 1 and 10),
  tech_linkup         int not null check (tech_linkup     between 1 and 10),

  -- Derivadas por trigger (promedio de subs) + score (v2). No editables a mano.
  technical           int     not null default 0,
  physical            int     not null default 0,
  mental              int     not null default 0,
  internal_score      numeric not null default 0,

  -- Rol/posición por grupo.
  role_field          public.player_role_field not null,
  position_pref       public.position_pref     not null,
  positions_possible  public.position_pref[]   not null default '{}',
  rating_confidence   public.rating_confidence not null default 'baja',

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (player_id, grupo_id)
);

comment on table public.player_group_ratings is
  'FUT-103: rating de un jugador EN un grupo a nivel de los 9 sub-ratings v2 (+ rol/posición). técnica/físico/mental e internal_score se derivan por trigger (reusa compute_internal_score_v2). Estable por (player_id, grupo_id). La edad queda global en players. RLS deny-all salvo SELECT admin/veedor; escritura por funciones SECURITY DEFINER (FUT-104).';

create index player_group_ratings_grupo_idx  on public.player_group_ratings (grupo_id);
create index player_group_ratings_player_idx on public.player_group_ratings (player_id);

-- 2. Derivar dimensiones (promedio de subs) + score v2 -----------------------
-- Reusa public.compute_internal_score_v2 (FUT-85), leyendo edad de players.
create or replace function public.player_group_ratings_set_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_edad int;
begin
  select edad into v_edad from public.players where id = new.player_id;

  -- Dimensión = promedio simple de sus 3 subs (spec v2).
  new.physical  := round((new.phys_power    + new.phys_speed      + new.phys_stamina)::numeric    / 3.0);
  new.mental    := round((new.ment_tactical + new.ment_resilience + new.ment_attitude)::numeric   / 3.0);
  new.technical := round((new.tech_passing  + new.tech_finishing  + new.tech_linkup)::numeric     / 3.0);

  new.internal_score := public.compute_internal_score_v2(
    new.physical::numeric, new.mental::numeric, new.technical::numeric, v_edad
  );
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.player_group_ratings_set_score() from public;

create trigger player_group_ratings_compute_score
  before insert or update of
    phys_power, phys_speed, phys_stamina,
    ment_tactical, ment_resilience, ment_attitude,
    tech_passing, tech_finishing, tech_linkup
  on public.player_group_ratings
  for each row
  execute function public.player_group_ratings_set_score();

-- 3. Recalcular el score de todas las filas de un jugador si cambia su edad ---
-- (el trigger de arriba no se entera de cambios en players.edad; los subs y las
-- dimensiones no cambian, solo el factor de edad sobre el físico).
create or replace function public.player_group_ratings_recompute_on_edad()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.player_group_ratings
     set internal_score = public.compute_internal_score_v2(
           physical::numeric, mental::numeric, technical::numeric, new.edad),
         updated_at = now()
   where player_id = new.id;
  return new;
end;
$$;

revoke all on function public.player_group_ratings_recompute_on_edad() from public;

create trigger players_recompute_group_scores_on_edad
  after update of edad on public.players
  for each row
  when (old.edad is distinct from new.edad)
  execute function public.player_group_ratings_recompute_on_edad();

-- 4. Auto-crear la fila de rating al agregar una membresía (copiada de la base) -
-- Copia los 9 subs (coalesce a la dimensión por si algún sub viejo está null).
-- on conflict do nothing: re-ingresar al grupo CONSERVA el rating afinado.
create or replace function public.grupo_membresias_seed_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.player_group_ratings (
    player_id, grupo_id,
    phys_power, phys_speed, phys_stamina,
    ment_tactical, ment_resilience, ment_attitude,
    tech_passing, tech_finishing, tech_linkup,
    role_field, position_pref, positions_possible, rating_confidence
  )
  select p.id, new.grupo_id,
    coalesce(p.phys_power,      p.physical),  coalesce(p.phys_speed,      p.physical),  coalesce(p.phys_stamina,   p.physical),
    coalesce(p.ment_tactical,   p.mental),    coalesce(p.ment_resilience, p.mental),    coalesce(p.ment_attitude,  p.mental),
    coalesce(p.tech_passing,    p.technical), coalesce(p.tech_finishing,  p.technical), coalesce(p.tech_linkup,    p.technical),
    p.role_field, p.position_pref, p.positions_possible, p.rating_confidence
    from public.players p
   where p.id = new.player_id
  on conflict (player_id, grupo_id) do nothing;

  return new;
end;
$$;

revoke all on function public.grupo_membresias_seed_rating() from public;

create trigger grupo_membresias_seed_group_rating
  after insert on public.grupo_membresias
  for each row
  execute function public.grupo_membresias_seed_rating();

-- 5. Backfill: una fila por cada (player_id, grupo_id) que ya aparece en
-- grupo_membresias (cualquier status, para conservar el rating ante re-ingresos).
-- Copia los 9 subs de la base; el trigger deriva dims + internal_score (v2).
insert into public.player_group_ratings (
  player_id, grupo_id,
  phys_power, phys_speed, phys_stamina,
  ment_tactical, ment_resilience, ment_attitude,
  tech_passing, tech_finishing, tech_linkup,
  role_field, position_pref, positions_possible, rating_confidence
)
select pr.player_id, pr.grupo_id,
  coalesce(p.phys_power,      p.physical),  coalesce(p.phys_speed,      p.physical),  coalesce(p.phys_stamina,   p.physical),
  coalesce(p.ment_tactical,   p.mental),    coalesce(p.ment_resilience, p.mental),    coalesce(p.ment_attitude,  p.mental),
  coalesce(p.tech_passing,    p.technical), coalesce(p.tech_finishing,  p.technical), coalesce(p.tech_linkup,    p.technical),
  p.role_field, p.position_pref, p.positions_possible, p.rating_confidence
  from (select distinct player_id, grupo_id from public.grupo_membresias) pr
  join public.players p on p.id = pr.player_id
on conflict (player_id, grupo_id) do nothing;

-- 6. RLS ---------------------------------------------------------------------
alter table public.player_group_ratings enable row level security;

-- SELECT: admin y veedor (como players). En 2b (FUT-107) se rescopea a
-- can_manage_grupo para el coordinador.
create policy player_group_ratings_select_admin_veedor
  on public.player_group_ratings
  for select
  to authenticated
  using (public.current_user_role() in ('admin', 'veedor'));

-- Sin policies de INSERT/UPDATE/DELETE: bloqueado para clientes. Solo los
-- triggers SECURITY DEFINER y las funciones de FUT-104 escriben.
