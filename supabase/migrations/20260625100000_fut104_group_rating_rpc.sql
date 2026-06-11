-- ============================================================================
-- FUT-104 (Fase 11, Bloque 1, 1b): RPC de rating por grupo + gate veedor x grupo
-- ============================================================================
--
-- Sobre la fundación de FUT-103 (player_group_ratings), agrega:
--   1. Gate del veedor POR GRUPO (grupos.veedor_activo), default = el valor
--      global actual (preserva el comportamiento de hoy). Helper + setter.
--   2. player_change_requests gana grupo_id: una solicitud con grupo_id != null
--      es un cambio al rating DE ESE GRUPO (se aplica a player_group_ratings);
--      con grupo_id null sigue siendo el cambio global a players (como hoy).
--      Se discrimina por grupo_id — NO se agrega un action_type nuevo (evita el
--      problema de usar un enum recién agregado en la misma transacción).
--   3. propose_group_rating_change: el admin (luego el coordinador, en 2b)
--      propone editar los 9 sub-ratings + rol/posición de un jugador en un grupo.
--      Si el grupo NO audita → se aplica directo; si audita → queda pendiente
--      para el veedor (mismo inbox que los cambios globales).
--   4. get_group_rating: lectura para la UI (1c).
--
-- Diseño de riesgo bajo: NO se toca _apply_change_request (motor global). Lo de
-- grupo vive en _apply_group_rating_request; approve/admin_apply solo rutean
-- según grupo_id. reject/flag son genéricos y no necesitan cambios.
--
-- Códigos: P0001 auth · P0002 not_found · P0004 invalid_status · P0006
--   player/rating_not_found · P0007 stale · P0013 not_an_admin · P0014 no_rating.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Gate del veedor por grupo
-- ----------------------------------------------------------------------------
alter table public.grupos
  add column if not exists veedor_activo boolean not null default false;

comment on column public.grupos.veedor_activo is
  'FUT-104: si los cambios de rating DE ESTE GRUPO pasan por el veedor. Default false; al migrar se hereda el valor global (requiere_veedor()).';

-- Hereda el comportamiento actual: los grupos existentes arrancan con el valor
-- global vigente. Los grupos nuevos arrancan en false (opt-in por grupo).
update public.grupos set veedor_activo = public.requiere_veedor();

create or replace function public.grupo_requiere_veedor(p_grupo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select veedor_activo from public.grupos where id = p_grupo_id), false);
$$;

comment on function public.grupo_requiere_veedor(uuid) is
  'FUT-104: true si los cambios de rating del grupo deben pasar por el veedor.';

revoke all on function public.grupo_requiere_veedor(uuid) from public;
grant execute on function public.grupo_requiere_veedor(uuid) to authenticated;

create or replace function public.set_grupo_requiere_veedor(p_grupo_id uuid, p_value boolean)
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

  -- En 2b (FUT-107) se rescopea a can_manage_grupo(p_grupo_id).
  select role into v_role from public.profiles where id = v_caller_id;
  if v_role is null or v_role <> 'admin' then
    raise exception 'not_an_admin' using errcode = 'P0013';
  end if;

  update public.grupos
     set veedor_activo = p_value
   where id = p_grupo_id;

  if not found then
    raise exception 'grupo_not_found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (actor_id, entity, entity_id, action, payload)
  values (
    v_caller_id, 'grupos', p_grupo_id, 'set_grupo_requiere_veedor',
    jsonb_build_object('veedor_activo', p_value)
  );
end;
$$;

comment on function public.set_grupo_requiere_veedor(uuid, boolean) is
  'FUT-104: el admin (luego coordinador) activa/desactiva el gate del veedor de un grupo. Audita.';

revoke all on function public.set_grupo_requiere_veedor(uuid, boolean) from public;
grant execute on function public.set_grupo_requiere_veedor(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. player_change_requests.grupo_id (null = global a players; set = a un grupo)
-- ----------------------------------------------------------------------------
alter table public.player_change_requests
  add column if not exists grupo_id uuid references public.grupos(id) on delete cascade;

comment on column public.player_change_requests.grupo_id is
  'FUT-104: si != null, el cambio es al rating DEL GRUPO (player_group_ratings); si null, es el cambio global a players (como hasta hoy). Solo válido con action_type=update_sensitive_fields.';

create index if not exists player_change_requests_grupo_idx
  on public.player_change_requests (grupo_id, status)
  where grupo_id is not null;

-- ----------------------------------------------------------------------------
-- 3. Snapshot del rating de un grupo (para old_values + staleness, sin divergir)
-- ----------------------------------------------------------------------------
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
    'rating_confidence',  rating_confidence
  )
  from public.player_group_ratings
  where player_id = p_player_id and grupo_id = p_grupo_id;
$$;

revoke all on function public._group_rating_snapshot(uuid, uuid) from public;

-- ----------------------------------------------------------------------------
-- 4. Aplicar una solicitud de rating de grupo (interno) — espejo de
--    _apply_change_request pero sobre player_group_ratings.
-- ----------------------------------------------------------------------------
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
    -- No es de grupo: no corresponde este motor.
    raise exception 'not_a_group_request' using errcode = 'P0008';
  end if;
  if v_request.status not in ('pending', 'flagged') then
    raise exception 'invalid_status' using errcode = 'P0004';
  end if;

  perform set_config('app.applying_change_request', 'true', true);

  v_proposed := v_request.proposed_values;

  -- Staleness: el rating del grupo no cambió desde que se propuso.
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
    rating_confidence  = coalesce((v_proposed->>'rating_confidence')::public.rating_confidence, rating_confidence)
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

-- ----------------------------------------------------------------------------
-- 5. approve / admin_apply: rutear según grupo_id (sin tocar el motor global)
-- ----------------------------------------------------------------------------
create or replace function public.approve_player_change_request(
  p_request_id uuid,
  p_comment    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id   uuid;
  v_caller_role public.user_role;
  v_request     public.player_change_requests;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'auth_required' using errcode = 'P0001';
  end if;

  select * into v_request
  from public.player_change_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  select role into v_caller_role from public.profiles where id = v_caller_id;
  if v_caller_role is null or v_caller_role <> 'veedor' then
    raise exception 'not_a_veedor' using errcode = 'P0003';
  end if;

  if v_request.status not in ('pending', 'flagged') then
    raise exception 'invalid_status' using errcode = 'P0004';
  end if;

  if v_request.requested_by = v_caller_id then
    raise exception 'cannot_approve_own_request' using errcode = 'P0005';
  end if;

  if v_request.grupo_id is not null then
    perform public._apply_group_rating_request(p_request_id, v_caller_id, p_comment, 'approve_change_request');
  else
    perform public._apply_change_request(p_request_id, v_caller_id, p_comment, 'approve_change_request');
  end if;
end;
$$;

create or replace function public.admin_apply_sensitive_change(
  p_request_id uuid,
  p_comment    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id   uuid;
  v_caller_role public.user_role;
  v_request     public.player_change_requests;
  v_gate        boolean;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'auth_required' using errcode = 'P0001';
  end if;

  select * into v_request
  from public.player_change_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  -- Gate correcto según el tipo: por grupo si es de grupo, global si no.
  v_gate := case
    when v_request.grupo_id is not null then public.grupo_requiere_veedor(v_request.grupo_id)
    else public.requiere_veedor()
  end;
  if v_gate then
    raise exception 'gate_active' using errcode = 'P0012';
  end if;

  select role into v_caller_role from public.profiles where id = v_caller_id;
  if v_caller_role is null or v_caller_role <> 'admin' then
    raise exception 'not_an_admin' using errcode = 'P0013';
  end if;

  if v_request.status not in ('pending', 'flagged') then
    raise exception 'invalid_status' using errcode = 'P0004';
  end if;

  if v_request.grupo_id is not null then
    perform public._apply_group_rating_request(p_request_id, v_caller_id, p_comment, 'admin_apply_direct');
  else
    perform public._apply_change_request(p_request_id, v_caller_id, p_comment, 'admin_apply_direct');
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. propose_group_rating_change: el admin propone editar el rating de un grupo
-- ----------------------------------------------------------------------------
-- p_proposed: jsonb con cualquiera de los 9 subs + role_field/position_pref/
-- positions_possible/rating_confidence. Devuelve { request_id, applied }.
create or replace function public.propose_group_rating_change(
  p_player_id uuid,
  p_grupo_id  uuid,
  p_proposed  jsonb,
  p_reason    text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_role      public.user_role;
  v_old       jsonb;
  v_request_id uuid;
  v_applied   boolean := false;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'auth_required' using errcode = 'P0001';
  end if;

  -- En 2b (FUT-107) se rescopea a can_manage_grupo(p_grupo_id).
  select role into v_role from public.profiles where id = v_caller_id;
  if v_role is null or v_role <> 'admin' then
    raise exception 'not_an_admin' using errcode = 'P0013';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  -- Tiene que existir el rating del grupo (lo siembra la membresía, FUT-103).
  v_old := public._group_rating_snapshot(p_player_id, p_grupo_id);
  if v_old is null then
    raise exception 'no_group_rating' using errcode = 'P0014';
  end if;

  insert into public.player_change_requests (
    player_id, grupo_id, action_type, requested_by,
    old_values, proposed_values, fields_changed, reason
  )
  values (
    p_player_id, p_grupo_id, 'update_sensitive_fields', v_caller_id,
    v_old, p_proposed,
    (select array_agg(k) from jsonb_object_keys(p_proposed) k),
    p_reason
  )
  returning id into v_request_id;

  -- Si el grupo no audita, se aplica directo (manteniendo la traza).
  if not public.grupo_requiere_veedor(p_grupo_id) then
    perform public._apply_group_rating_request(v_request_id, v_caller_id, p_reason, 'admin_apply_direct');
    v_applied := true;
  end if;

  return jsonb_build_object('request_id', v_request_id, 'applied', v_applied);
end;
$$;

comment on function public.propose_group_rating_change(uuid, uuid, jsonb, text) is
  'FUT-104: propone editar el rating de un jugador en un grupo (9 subs + rol/posición). Si el grupo no audita, aplica directo; si audita, queda pendiente para el veedor.';

revoke all on function public.propose_group_rating_change(uuid, uuid, jsonb, text) from public;
grant execute on function public.propose_group_rating_change(uuid, uuid, jsonb, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. get_group_rating: lectura del rating de un grupo (para la UI de 1c)
-- ----------------------------------------------------------------------------
create or replace function public.get_group_rating(p_player_id uuid, p_grupo_id uuid)
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
  rating_confidence  public.rating_confidence
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
         r.role_field, r.position_pref, r.positions_possible, r.rating_confidence
    from public.player_group_ratings r
   where r.player_id = p_player_id
     and r.grupo_id  = p_grupo_id
     -- En 2b se rescopea a can_manage_grupo(p_grupo_id).
     and public.current_user_role() in ('admin', 'veedor');
$$;

revoke all on function public.get_group_rating(uuid, uuid) from public;
grant execute on function public.get_group_rating(uuid, uuid) to authenticated;
