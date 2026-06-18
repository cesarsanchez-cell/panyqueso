-- ============================================================================
-- Liderazgo (Fase 3): de 'ninguno/medio/alto' a 'negativo/ninguno/positivo'
-- ============================================================================
--
-- Se simplifica el liderazgo a TRES estados y se suma la cara negativa:
--   * positivo  → un líder que organiza y mejora a su equipo (potencia, coef ≥ 1).
--   * ninguno   → neutro (coef 1).
--   * negativo  → un "quejoso" que molesta a sus compañeros (penaliza, coef ≤ 1).
--
-- Conteo en el armado (Fase 2 del código): el positivo NO acumula (si hay dos,
-- cuenta uno); el negativo SÍ acumula (cada quejoso multiplica). Reparto: ambos
-- se distribuyen entre equipos para no amontonarlos.
--
-- Como prod ya tiene el enum 'ninguno/medio/alto' (Fase 1), se recrea el tipo y
-- se mapea medio/alto → positivo. Atómico (usa CREATE TYPE, cuyos valores ya son
-- usables en la misma transacción, a diferencia de ALTER TYPE ADD VALUE).
-- ============================================================================

-- 1. Nuevo enum y migración de la columna -----------------------------------
create type public.liderazgo_nivel_new as enum ('negativo', 'ninguno', 'positivo');

alter table public.player_group_ratings alter column liderazgo drop default;
alter table public.player_group_ratings
  alter column liderazgo type public.liderazgo_nivel_new
  using (
    case liderazgo::text
      when 'alto' then 'positivo'
      when 'medio' then 'positivo'
      else 'ninguno'
    end
  )::public.liderazgo_nivel_new;
alter table public.player_group_ratings
  alter column liderazgo set default 'ninguno'::public.liderazgo_nivel_new;

-- get_group_rating expone el tipo en su RETURN → depende del tipo viejo. Hay
-- que dropearla antes de poder dropear el tipo; se recrea más abajo.
drop function if exists public.get_group_rating(uuid, uuid);

drop type public.liderazgo_nivel;
alter type public.liderazgo_nivel_new rename to liderazgo_nivel;

comment on type public.liderazgo_nivel is
  'Liderazgo de un jugador en un grupo: negativo (quejoso, penaliza) / ninguno (neutro) / positivo (potencia). NO entra al internal_score.';

-- 2. Recrear las funciones SQL que tocan la columna (replan limpio) ----------
-- _group_rating_snapshot (lee la columna para el snapshot de auditoría).
create or replace function public._group_rating_snapshot(p_player_id uuid, p_grupo_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'phys_power',         phys_power,
    'phys_speed',         phys_speed,
    'phys_stamina',       phys_stamina,
    'ment_tactical',      ment_tactical,
    'ment_resilience',    ment_resilience,
    'ment_attitude',      ment_attitude,
    'tech_passing',       tech_passing,
    'tech_finishing',     tech_finishing,
    'tech_linkup',        tech_linkup,
    'role_field',         role_field,
    'position_pref',      position_pref,
    'positions_possible', to_jsonb(positions_possible),
    'rating_confidence',  rating_confidence,
    'liderazgo',          liderazgo
  )
  from public.player_group_ratings
  where player_id = p_player_id and grupo_id = p_grupo_id;
$$;

revoke all on function public._group_rating_snapshot(uuid, uuid) from public;

-- get_group_rating (FUT-125: gate can_manage_grupo OR can_audit_grupo).
create function public.get_group_rating(p_player_id uuid, p_grupo_id uuid)
returns table (
  player_id          uuid,
  grupo_id           uuid,
  phys_power         int,
  phys_speed         int,
  phys_stamina       int,
  ment_tactical      int,
  ment_resilience    int,
  ment_attitude      int,
  tech_passing       int,
  tech_finishing     int,
  tech_linkup        int,
  technical          int,
  physical           int,
  mental             int,
  internal_score     numeric,
  role_field         public.player_role_field,
  position_pref      public.position_pref,
  positions_possible public.position_pref[],
  rating_confidence  public.rating_confidence,
  liderazgo          public.liderazgo_nivel
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.player_id, r.grupo_id,
         r.phys_power, r.phys_speed, r.phys_stamina,
         r.ment_tactical, r.ment_resilience, r.ment_attitude,
         r.tech_passing, r.tech_finishing, r.tech_linkup,
         r.technical, r.physical, r.mental, r.internal_score,
         r.role_field, r.position_pref, r.positions_possible, r.rating_confidence, r.liderazgo
    from public.player_group_ratings r
   where r.player_id = p_player_id
     and r.grupo_id  = p_grupo_id
     and (
       public.can_manage_grupo(p_grupo_id)
       or public.can_audit_grupo(p_grupo_id)
     );
$$;

revoke all on function public.get_group_rating(uuid, uuid) from public;
grant execute on function public.get_group_rating(uuid, uuid) to authenticated;

-- 3. Coeficientes: positivo (≥1, potencia) y negativo (≤1, penaliza) ---------
drop function if exists public.set_liderazgo_coeficientes(numeric, numeric);

alter table public.app_settings drop column if exists liderazgo_coef_medio;
alter table public.app_settings drop column if exists liderazgo_coef_alto;

alter table public.app_settings
  add column if not exists liderazgo_coef_positivo numeric(4, 2) not null default 1.00
    check (liderazgo_coef_positivo >= 1.00 and liderazgo_coef_positivo <= 5.00),
  add column if not exists liderazgo_coef_negativo numeric(4, 2) not null default 1.00
    check (liderazgo_coef_negativo >= 0.10 and liderazgo_coef_negativo <= 1.00);

comment on column public.app_settings.liderazgo_coef_positivo is
  'Coeficiente (≥1.00) por el que un líder positivo multiplica el score de su equipo en el armado. No acumulativo. Default 1.00 (sin efecto).';
comment on column public.app_settings.liderazgo_coef_negativo is
  'Coeficiente (≤1.00) por el que CADA jugador negativo multiplica el score de su equipo (acumulativo). Default 1.00 (sin efecto).';

create function public.set_liderazgo_coeficientes(
  p_positivo numeric,
  p_negativo numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_role      public.user_role;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'auth_required' using errcode = 'P0001';
  end if;

  select role into v_role from public.profiles where id = v_caller_id;
  if v_role is null or v_role <> 'admin' then
    raise exception 'not_an_admin' using errcode = 'P0013';
  end if;

  if p_positivo < 1.00 or p_positivo > 5.00 then
    raise exception 'coef_fuera_de_rango' using errcode = 'P0001',
      detail = 'El coeficiente positivo debe estar entre 1.00 y 5.00.';
  end if;
  if p_negativo < 0.10 or p_negativo > 1.00 then
    raise exception 'coef_fuera_de_rango' using errcode = 'P0001',
      detail = 'El coeficiente negativo debe estar entre 0.10 y 1.00.';
  end if;

  update public.app_settings
     set liderazgo_coef_positivo = p_positivo,
         liderazgo_coef_negativo = p_negativo,
         updated_at = now(),
         updated_by = v_caller_id
   where id;

  insert into public.audit_log (actor_id, entity, entity_id, action, payload)
  values (
    v_caller_id, 'app_settings', null, 'set_liderazgo_coeficientes',
    jsonb_build_object('liderazgo_coef_positivo', p_positivo, 'liderazgo_coef_negativo', p_negativo)
  );
end;
$$;

comment on function public.set_liderazgo_coeficientes(numeric, numeric) is
  'Liderazgo: el admin ajusta los coeficientes de potenciación (positivo ≥1) y penalización (negativo ≤1). Audita el cambio.';

revoke all on function public.set_liderazgo_coeficientes(numeric, numeric) from public;
grant execute on function public.set_liderazgo_coeficientes(numeric, numeric) to authenticated;
