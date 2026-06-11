-- ============================================================================
-- FUT-103 (Fase 11, Bloque 1, 1a): ratings POR GRUPO — player_group_ratings
-- ============================================================================
--
-- El rating deja de ser global: un mismo jugador (1 celular) puede rendir
-- distinto en cada grupo (F11 vs F5), y cada coordinador lo califica con su
-- impronta. Esta migración crea la fundación de datos; el acceso real (RPC +
-- gate del veedor por grupo) va en 1b (FUT-104) y la UI en 1c (FUT-105).
--
-- Decisiones (con el usuario, 2026-06-11):
--   - Tabla DEDICADA por (player_id, grupo_id), estable: sobrevive al churn de
--     grupo_membresias (cuando un jugador se baja/vuelve se crea una membresía
--     nueva, pero el rating del grupo se conserva).
--   - `edad` queda GLOBAL en players (la edad es la misma persona en todos lados);
--     lo que difiere por grupo es technical/physical/mental + rol/posición.
--   - players.technical/physical/mental/role_field/position_pref quedan como
--     BASE/SEMILLA (no se borran).
--   - Rating inicial al entrar a un grupo nuevo = COPIADO de la base.
--   - Poblado a futuro = TRIGGER auto-crea la fila al agregar la membresía
--     (no se sobrescribe si ya existe).
--
-- internal_score se recalcula con la MISMA fórmula del trigger de players
-- (técnica·0.45 + físico·factor_edad·0.30 + mental·0.25), leyendo edad de players.
--
-- RLS: SELECT admin+veedor (como players). INSERT/UPDATE/DELETE bloqueados para
-- clientes; solo triggers SECURITY DEFINER y las funciones de 1b modifican.
-- ============================================================================

-- 1. Tabla -------------------------------------------------------------------
create table public.player_group_ratings (
  id                  uuid primary key default gen_random_uuid(),
  player_id           uuid not null references public.players(id) on delete cascade,
  grupo_id            uuid not null references public.grupos(id)  on delete cascade,
  technical           int not null check (technical between 1 and 10),
  physical            int not null check (physical between 1 and 10),
  mental              int not null check (mental between 1 and 10),
  role_field          public.player_role_field not null,
  position_pref       public.position_pref     not null,
  positions_possible  public.position_pref[]   not null default '{}',
  internal_score      numeric not null default 0,
  rating_confidence   public.rating_confidence not null default 'baja',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (player_id, grupo_id)
);

comment on table public.player_group_ratings is
  'FUT-103: rating de un jugador EN un grupo (técnica/físico/mental→score + rol/posición). Estable por (player_id, grupo_id). La edad queda global en players. RLS deny-all salvo SELECT admin/veedor; escritura por funciones SECURITY DEFINER (FUT-104).';

create index player_group_ratings_grupo_idx  on public.player_group_ratings (grupo_id);
create index player_group_ratings_player_idx on public.player_group_ratings (player_id);

-- 2. Trigger de internal_score (espejo del trigger de players, edad de players) -
create or replace function public.player_group_ratings_set_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_edad      int;
  factor_edad numeric;
begin
  select edad into v_edad from public.players where id = new.player_id;

  -- factor_edad = 1.00 hasta 32 años, baja 1.5% por año hasta piso de 0.75.
  factor_edad := case
    when v_edad is null  then 1.00
    when v_edad <= 32    then 1.00
    when v_edad >= 55    then 0.75
    else greatest(0.75, 1.00 - (v_edad - 32)::numeric * 0.015)
  end;

  new.internal_score := round(
      (new.technical::numeric * 0.45)
    + (new.physical::numeric  * factor_edad * 0.30)
    + (new.mental::numeric    * 0.25),
    2
  );
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.player_group_ratings_set_score() from public;

create trigger player_group_ratings_compute_score
  before insert or update of technical, physical, mental
  on public.player_group_ratings
  for each row
  execute function public.player_group_ratings_set_score();

-- 3. Recalcular el score de todas las filas de un jugador si cambia su edad ---
-- (el trigger de arriba no se entera de cambios en players.edad).
create or replace function public.player_group_ratings_recompute_on_edad()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  factor_edad numeric;
begin
  factor_edad := case
    when new.edad <= 32 then 1.00
    when new.edad >= 55 then 0.75
    else greatest(0.75, 1.00 - (new.edad - 32)::numeric * 0.015)
  end;

  update public.player_group_ratings
     set internal_score = round(
           (technical::numeric * 0.45)
         + (physical::numeric  * factor_edad * 0.30)
         + (mental::numeric    * 0.25),
         2),
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
-- on conflict do nothing: si ya hay rating para ese (player, grupo) — ej. el
-- jugador se había ido y vuelve — se CONSERVA el rating afinado del grupo.
create or replace function public.grupo_membresias_seed_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.player_group_ratings (
    player_id, grupo_id, technical, physical, mental,
    role_field, position_pref, positions_possible, rating_confidence
  )
  select p.id, new.grupo_id, p.technical, p.physical, p.mental,
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
-- Copia la base del jugador; el trigger de score calcula internal_score.
insert into public.player_group_ratings (
  player_id, grupo_id, technical, physical, mental,
  role_field, position_pref, positions_possible, rating_confidence
)
select pr.player_id, pr.grupo_id, p.technical, p.physical, p.mental,
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
