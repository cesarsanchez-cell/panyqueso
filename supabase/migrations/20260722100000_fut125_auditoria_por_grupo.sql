-- ============================================================================
-- FUT-125 (Fase 2): la auditoría pasa a ser POR GRUPO (modelo fusionado)
-- ============================================================================
--
-- Con el veedor ya por grupo (FUT-124), acá se rescopea el camino de auditoría:
--
--   1. "¿este grupo audita sus ratings?" = "¿el grupo tiene un veedor asignado?"
--      → grupo_requiere_veedor() pasa a leer veedor_grupos (no grupos.veedor_activo).
--   2. El gate GLOBAL (requiere_veedor()) se depreca: ya no hay veedor global, así
--      que los cambios sin grupo se aplican directo. Pasa a devolver false.
--   3. approve/reject/flag: ahora lo hace el veedor DE ESE GRUPO (no cualquier
--      veedor). Gate is_veedor_de_grupo(grupo del request).
--   4. La cola (RLS de player_change_requests): el veedor ve solo los requests de
--      SUS grupos.
--   5. get_group_rating: lectura del rating acotada a admin / coordinador / veedor
--      DE ESE grupo (antes cualquier veedor leía cualquier grupo).
--
-- grupos.veedor_activo y app_settings.requiere_veedor quedan en la base pero sin
-- uso (la UI que los toca se saca en la Fase 3).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Helper: ¿el usuario logueado es veedor DE este grupo? (sin incluir admin)
-- ---------------------------------------------------------------------------
create or replace function public.is_veedor_de_grupo(p_grupo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.veedor_grupos vg
     where vg.profile_id = auth.uid()
       and vg.grupo_id = p_grupo_id
  );
$$;

comment on function public.is_veedor_de_grupo(uuid) is
  'FUT-125: true si el usuario logueado es veedor asignado a ese grupo (no incluye admin). Gate de approve/reject/flag y de la lectura de la cola.';

revoke all on function public.is_veedor_de_grupo(uuid) from public;
grant execute on function public.is_veedor_de_grupo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. grupo_requiere_veedor: "¿el grupo tiene veedor?" (modelo fusionado)
-- ---------------------------------------------------------------------------
create or replace function public.grupo_requiere_veedor(p_grupo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.veedor_grupos vg where vg.grupo_id = p_grupo_id
  );
$$;

comment on function public.grupo_requiere_veedor(uuid) is
  'FUT-125: un grupo audita sus ratings iff tiene >=1 veedor asignado (veedor_grupos). Reemplaza la lectura de grupos.veedor_activo.';

revoke all on function public.grupo_requiere_veedor(uuid) from public;
grant execute on function public.grupo_requiere_veedor(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. requiere_veedor (global): deprecado → false (ya no hay veedor global)
-- ---------------------------------------------------------------------------
create or replace function public.requiere_veedor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false;
$$;

comment on function public.requiere_veedor() is
  'FUT-125: deprecado. El veedor es por grupo (ver grupo_requiere_veedor). Sin veedor global, los cambios sin grupo se aplican directo → devuelve false.';

revoke all on function public.requiere_veedor() from public;
grant execute on function public.requiere_veedor() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. approve / reject / flag: ahora gatean al veedor DE ESE GRUPO
-- ---------------------------------------------------------------------------
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
  v_caller_id uuid;
  v_request   public.player_change_requests;
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

  -- FUT-125: lo aprueba el veedor DE ESE GRUPO (no cualquier veedor). Los
  -- requests sin grupo no pasan por veedor (gate global deprecado).
  if v_request.grupo_id is null or not public.is_veedor_de_grupo(v_request.grupo_id) then
    raise exception 'not_a_veedor' using errcode = 'P0003';
  end if;

  if v_request.status not in ('pending', 'flagged') then
    raise exception 'invalid_status' using errcode = 'P0004';
  end if;

  if v_request.requested_by = v_caller_id then
    raise exception 'cannot_approve_own_request' using errcode = 'P0005';
  end if;

  perform public._apply_group_rating_request(p_request_id, v_caller_id, p_comment, 'approve_change_request');
end;
$$;

create or replace function public.reject_player_change_request(
  p_request_id uuid,
  p_comment    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_request   public.player_change_requests;
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

  if v_request.grupo_id is null or not public.is_veedor_de_grupo(v_request.grupo_id) then
    raise exception 'not_a_veedor' using errcode = 'P0003';
  end if;

  if v_request.status not in ('pending', 'flagged') then
    raise exception 'invalid_status' using errcode = 'P0004';
  end if;

  if v_request.requested_by = v_caller_id then
    raise exception 'cannot_reject_own_request' using errcode = 'P0005';
  end if;

  perform set_config('app.applying_change_request', 'true', true);

  update public.player_change_requests
  set
    status         = 'rejected',
    reviewed_by    = v_caller_id,
    reviewed_at    = now(),
    review_comment = p_comment
  where id = p_request_id;

  insert into public.audit_log (actor_id, entity, entity_id, action, payload)
  values (
    v_caller_id,
    'player_change_request',
    p_request_id,
    'reject_change_request',
    jsonb_build_object(
      'action_type',     v_request.action_type,
      'player_id',       v_request.player_id,
      'requested_by',    v_request.requested_by,
      'proposed_values', v_request.proposed_values,
      'comment',         p_comment
    )
  );
end;
$$;

create or replace function public.flag_player_change_request(
  p_request_id uuid,
  p_comment    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_request   public.player_change_requests;
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

  if v_request.grupo_id is null or not public.is_veedor_de_grupo(v_request.grupo_id) then
    raise exception 'not_a_veedor' using errcode = 'P0003';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'invalid_status' using errcode = 'P0004';
  end if;

  if v_request.requested_by = v_caller_id then
    raise exception 'cannot_flag_own_request' using errcode = 'P0005';
  end if;

  perform set_config('app.applying_change_request', 'true', true);

  update public.player_change_requests
  set
    status         = 'flagged',
    reviewed_by    = v_caller_id,
    reviewed_at    = now(),
    review_comment = p_comment
  where id = p_request_id;

  insert into public.audit_log (actor_id, entity, entity_id, action, payload)
  values (
    v_caller_id,
    'player_change_request',
    p_request_id,
    'flag_change_request',
    jsonb_build_object(
      'action_type',     v_request.action_type,
      'player_id',       v_request.player_id,
      'requested_by',    v_request.requested_by,
      'proposed_values', v_request.proposed_values,
      'comment',         p_comment
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS de la cola: el veedor ve solo los requests de SUS grupos
-- ---------------------------------------------------------------------------
drop policy if exists player_change_requests_select_all_veedor on public.player_change_requests;
create policy player_change_requests_select_all_veedor
  on public.player_change_requests
  for select
  to authenticated
  using (grupo_id is not null and public.is_veedor_de_grupo(grupo_id));

-- ---------------------------------------------------------------------------
-- 5. get_group_rating: lectura acotada a quien gestiona o audita ESE grupo
-- ---------------------------------------------------------------------------
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
     and (
       public.can_manage_grupo(p_grupo_id)   -- admin o coordinador del grupo
       or public.can_audit_grupo(p_grupo_id) -- admin o veedor del grupo
     );
$$;

revoke all on function public.get_group_rating(uuid, uuid) from public;
grant execute on function public.get_group_rating(uuid, uuid) to authenticated;
