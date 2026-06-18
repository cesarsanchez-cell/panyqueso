-- ============================================================================
-- Liderazgo (Fase 1): esquema + config, INERTE (no cambia el armado todavía)
-- ============================================================================
--
-- Nueva variable de calificación POR GRUPO: "liderazgo". No es una skill más
-- (no entra al internal_score): es un POTENCIADOR de equipo. La mayoría de los
-- jugadores es 'ninguno'; si un equipo tiene un líder, multiplica el score del
-- equipo en el balance (Fase 2).
--
-- Esta migración es backward-compatible e inerte:
--   * Columna `liderazgo` en player_group_ratings, default 'ninguno'.
--   * Coeficientes editables en app_settings, default 1.00 → ×1 = sin efecto.
--   * El seed/herencia y las RPCs de rating por grupo pasan a arrastrar
--     liderazgo; si el form viejo no lo manda, queda en el default (la app
--     actual sigue intacta).
-- El multiplicador en el generador y la UI llegan en Fase 2.
-- ============================================================================

-- 1. Enum de nivel -----------------------------------------------------------
create type public.liderazgo_nivel as enum ('ninguno', 'medio', 'alto');

comment on type public.liderazgo_nivel is
  'Liderazgo de un jugador en un grupo: ninguno (default) / medio / alto. Potenciador de equipo, NO entra al internal_score.';

-- 2. Columna en el rating por grupo ------------------------------------------
alter table public.player_group_ratings
  add column if not exists liderazgo public.liderazgo_nivel not null default 'ninguno';

comment on column public.player_group_ratings.liderazgo is
  'Liderazgo del jugador EN este grupo. No afecta el internal_score; en el armado multiplica el score del equipo que lo tiene (coef en app_settings).';

-- 3. Coeficientes por nivel (config de una sola fila) ------------------------
-- 'ninguno' es siempre 1.00 (no se guarda). 'medio'/'alto' arrancan en 1.00
-- (sin efecto) y se ajustan a mano desde /configuración (Fase 2).
alter table public.app_settings
  add column if not exists liderazgo_coef_medio numeric(4, 2) not null default 1.00
    check (liderazgo_coef_medio >= 1.00 and liderazgo_coef_medio <= 5.00),
  add column if not exists liderazgo_coef_alto numeric(4, 2) not null default 1.00
    check (liderazgo_coef_alto >= 1.00 and liderazgo_coef_alto <= 5.00);

comment on column public.app_settings.liderazgo_coef_medio is
  'Coeficiente por el que se multiplica el score del equipo si tiene un líder nivel medio. Default 1.00 (sin efecto).';
comment on column public.app_settings.liderazgo_coef_alto is
  'Coeficiente por el que se multiplica el score del equipo si tiene un líder nivel alto. Default 1.00 (sin efecto).';

-- 4. Setter de coeficientes (solo admin) -------------------------------------
create or replace function public.set_liderazgo_coeficientes(
  p_medio numeric,
  p_alto  numeric
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

  if p_medio < 1.00 or p_medio > 5.00 or p_alto < 1.00 or p_alto > 5.00 then
    raise exception 'coef_fuera_de_rango' using errcode = 'P0001',
      detail = 'Los coeficientes deben estar entre 1.00 y 5.00.';
  end if;

  update public.app_settings
     set liderazgo_coef_medio = p_medio,
         liderazgo_coef_alto  = p_alto,
         updated_at = now(),
         updated_by = v_caller_id
   where id;

  insert into public.audit_log (actor_id, entity, entity_id, action, payload)
  values (
    v_caller_id, 'app_settings', null, 'set_liderazgo_coeficientes',
    jsonb_build_object('liderazgo_coef_medio', p_medio, 'liderazgo_coef_alto', p_alto)
  );
end;
$$;

comment on function public.set_liderazgo_coeficientes(numeric, numeric) is
  'Liderazgo: el admin ajusta los coeficientes de potenciación (medio/alto). Audita el cambio.';

revoke all on function public.set_liderazgo_coeficientes(numeric, numeric) from public;
grant execute on function public.set_liderazgo_coeficientes(numeric, numeric) to authenticated;

-- 5. Seed/herencia del rating por grupo: arrastrar liderazgo ------------------
-- Reproduce la versión vigente (FUT-108) y suma liderazgo: en la rama de
-- herencia copia el del grupo más reciente; en la base arranca en 'ninguno'.
create or replace function public.grupo_membresias_seed_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src public.player_group_ratings;
begin
  select pgr.* into v_src
    from public.player_group_ratings pgr
   where pgr.player_id = new.player_id
   order by pgr.updated_at desc
   limit 1;

  if v_src.player_id is not null then
    insert into public.player_group_ratings (
      player_id, grupo_id,
      phys_power, phys_speed, phys_stamina,
      ment_tactical, ment_resilience, ment_attitude,
      tech_passing, tech_finishing, tech_linkup,
      role_field, position_pref, positions_possible, rating_confidence, liderazgo
    )
    values (
      new.player_id, new.grupo_id,
      v_src.phys_power, v_src.phys_speed, v_src.phys_stamina,
      v_src.ment_tactical, v_src.ment_resilience, v_src.ment_attitude,
      v_src.tech_passing, v_src.tech_finishing, v_src.tech_linkup,
      v_src.role_field, v_src.position_pref, v_src.positions_possible, v_src.rating_confidence,
      v_src.liderazgo
    )
    on conflict (player_id, grupo_id) do nothing;
  else
    insert into public.player_group_ratings (
      player_id, grupo_id,
      phys_power, phys_speed, phys_stamina,
      ment_tactical, ment_resilience, ment_attitude,
      tech_passing, tech_finishing, tech_linkup,
      role_field, position_pref, positions_possible, rating_confidence, liderazgo
    )
    select p.id, new.grupo_id,
      coalesce(p.phys_power,      p.physical),  coalesce(p.phys_speed,      p.physical),  coalesce(p.phys_stamina,   p.physical),
      coalesce(p.ment_tactical,   p.mental),    coalesce(p.ment_resilience, p.mental),    coalesce(p.ment_attitude,  p.mental),
      coalesce(p.tech_passing,    p.technical), coalesce(p.tech_finishing,  p.technical), coalesce(p.tech_linkup,    p.technical),
      p.role_field, p.position_pref, p.positions_possible, p.rating_confidence, 'ninguno'::public.liderazgo_nivel
      from public.players p
     where p.id = new.player_id
    on conflict (player_id, grupo_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.grupo_membresias_seed_rating() from public;

-- 6. Snapshot del rating de grupo: incluir liderazgo -------------------------
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

-- 7. Aplicar cambio de rating de grupo: setear liderazgo ---------------------
-- Reproduce la versión vigente (FUT-104) sumando liderazgo por coalesce.
create or replace function public._apply_group_rating_request(
  p_request_id uuid,
  p_actor_id   uuid,
  p_comment    text,
  p_action     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request   public.player_change_requests;
  v_proposed  jsonb;
  v_current   jsonb;
  v_key       text;
  v_old_value text;
begin
  select * into v_request
  from public.player_change_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if v_request.grupo_id is null then
    raise exception 'not_a_group_request' using errcode = 'P0008';
  end if;
  if v_request.status not in ('pending', 'flagged') then
    raise exception 'invalid_status' using errcode = 'P0004';
  end if;

  perform set_config('app.applying_change_request', 'true', true);

  v_proposed := v_request.proposed_values;

  v_current := public._group_rating_snapshot(v_request.player_id, v_request.grupo_id);
  if v_current is null then
    raise exception 'rating_not_found' using errcode = 'P0006';
  end if;
  if v_request.old_values is not null then
    for v_key, v_old_value in select * from jsonb_each_text(v_request.old_values)
    loop
      if (v_current->>v_key) is distinct from v_old_value then
        raise exception 'stale_request'
          using errcode = 'P0007', detail = format('field %s changed', v_key);
      end if;
    end loop;
  end if;

  update public.player_group_ratings set
    phys_power         = coalesce((v_proposed->>'phys_power')::int,      phys_power),
    phys_speed         = coalesce((v_proposed->>'phys_speed')::int,      phys_speed),
    phys_stamina       = coalesce((v_proposed->>'phys_stamina')::int,    phys_stamina),
    ment_tactical      = coalesce((v_proposed->>'ment_tactical')::int,   ment_tactical),
    ment_resilience    = coalesce((v_proposed->>'ment_resilience')::int, ment_resilience),
    ment_attitude      = coalesce((v_proposed->>'ment_attitude')::int,   ment_attitude),
    tech_passing       = coalesce((v_proposed->>'tech_passing')::int,    tech_passing),
    tech_finishing     = coalesce((v_proposed->>'tech_finishing')::int,  tech_finishing),
    tech_linkup        = coalesce((v_proposed->>'tech_linkup')::int,     tech_linkup),
    role_field         = coalesce((v_proposed->>'role_field')::public.player_role_field, role_field),
    position_pref      = coalesce((v_proposed->>'position_pref')::public.position_pref, position_pref),
    positions_possible = coalesce(
      (select array_agg(value::public.position_pref)
         from jsonb_array_elements_text(v_proposed->'positions_possible')),
      positions_possible),
    rating_confidence  = coalesce((v_proposed->>'rating_confidence')::public.rating_confidence, rating_confidence),
    liderazgo          = coalesce((v_proposed->>'liderazgo')::public.liderazgo_nivel, liderazgo)
  where player_id = v_request.player_id and grupo_id = v_request.grupo_id;

  update public.player_change_requests set
    status         = 'approved',
    reviewed_by    = p_actor_id,
    reviewed_at    = now(),
    review_comment = p_comment
  where id = p_request_id;

  insert into public.audit_log (actor_id, entity, entity_id, action, payload)
  values (
    p_actor_id, 'player_change_request', p_request_id, p_action,
    jsonb_build_object(
      'action_type',     'update_group_rating',
      'player_id',       v_request.player_id,
      'grupo_id',        v_request.grupo_id,
      'requested_by',    v_request.requested_by,
      'old_values',      v_request.old_values,
      'proposed_values', v_request.proposed_values,
      'comment',         p_comment
    )
  );
end;
$$;

revoke all on function public._apply_group_rating_request(uuid, uuid, text, text) from public;

-- 8. get_group_rating: devolver liderazgo ------------------------------------
-- Cambia el return type (columna nueva) → drop + create. Reproduce la versión
-- vigente (FUT-125) sumando liderazgo.
drop function if exists public.get_group_rating(uuid, uuid);
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
