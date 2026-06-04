-- ============================================================================
-- FUT-86 (Fase 2b · DB): approve_player_change_request aplica los 9 sub-ratings
-- ============================================================================
--
-- La UI de la Fase 2b deja al admin cargar los 9 subcomponentes. Como toda
-- mutación de ratings pasa por approve_player_change_request (gate del veedor),
-- esta función tiene que saber aplicarlos — hoy aplica solo un set fijo de
-- campos. Acá la extendemos para incluir las 9 columnas en:
--   - create_player          (INSERT del alta)
--   - update_sensitive_fields (UPDATE de edición de ratings)
--
-- Las dimensiones técnica/físico/mental se siguen aplicando (la UI las manda
-- como el promedio redondeado de sus 3 subs); el trigger players_compute_score
-- recalcula internal_score con la v2 porque siempre van en el SET. Los subs
-- quedan guardados para granularidad. En create_player, si falta un sub se cae
-- al valor de la dimensión (compat con altas que solo mandan dimensiones).
--
-- Resto de la función: idéntico a 20260522124854 + (Fase 9) fecha_nacimiento.
-- ============================================================================

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
  v_caller_id     uuid;
  v_caller_role   public.user_role;
  v_request       public.player_change_requests;
  v_player_json   jsonb;
  v_proposed      jsonb;
  v_old           jsonb;
  v_key           text;
  v_old_value     text;
  v_new_player_id uuid;
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

  select role into v_caller_role
  from public.profiles
  where id = v_caller_id;

  if v_caller_role is null or v_caller_role <> 'veedor' then
    raise exception 'not_a_veedor' using errcode = 'P0003';
  end if;

  if v_request.status not in ('pending', 'flagged') then
    raise exception 'invalid_status' using errcode = 'P0004';
  end if;

  if v_request.requested_by = v_caller_id then
    raise exception 'cannot_approve_own_request' using errcode = 'P0005';
  end if;

  perform set_config('app.applying_change_request', 'true', true);

  v_proposed := v_request.proposed_values;

  if v_request.action_type = 'create_player' then
    insert into public.players (
      nombre, edad, fecha_nacimiento, role_field, position_pref, positions_possible,
      technical, physical, mental, rating_confidence,
      phys_power, phys_speed, phys_stamina,
      ment_tactical, ment_resilience, ment_attitude,
      tech_passing, tech_finishing, tech_linkup,
      private_notes, status, created_by
    )
    values (
      v_proposed->>'nombre',
      (v_proposed->>'edad')::int,
      nullif(v_proposed->>'fecha_nacimiento', '')::date,
      (v_proposed->>'role_field')::public.player_role_field,
      (v_proposed->>'position_pref')::public.position_pref,
      coalesce(
        (select array_agg(value::public.position_pref)
         from jsonb_array_elements_text(v_proposed->'positions_possible')),
        '{}'::public.position_pref[]
      ),
      (v_proposed->>'technical')::int,
      (v_proposed->>'physical')::int,
      (v_proposed->>'mental')::int,
      coalesce((v_proposed->>'rating_confidence')::public.rating_confidence, 'baja'),
      coalesce((v_proposed->>'phys_power')::int,      (v_proposed->>'physical')::int),
      coalesce((v_proposed->>'phys_speed')::int,      (v_proposed->>'physical')::int),
      coalesce((v_proposed->>'phys_stamina')::int,    (v_proposed->>'physical')::int),
      coalesce((v_proposed->>'ment_tactical')::int,   (v_proposed->>'mental')::int),
      coalesce((v_proposed->>'ment_resilience')::int, (v_proposed->>'mental')::int),
      coalesce((v_proposed->>'ment_attitude')::int,   (v_proposed->>'mental')::int),
      coalesce((v_proposed->>'tech_passing')::int,    (v_proposed->>'technical')::int),
      coalesce((v_proposed->>'tech_finishing')::int,  (v_proposed->>'technical')::int),
      coalesce((v_proposed->>'tech_linkup')::int,     (v_proposed->>'technical')::int),
      v_proposed->>'private_notes',
      'approved',
      v_request.requested_by
    )
    returning id into v_new_player_id;

  elsif v_request.action_type = 'update_sensitive_fields' then
    if v_request.old_values is not null then
      select to_jsonb(p.*) into v_player_json
      from public.players p
      where p.id = v_request.player_id
      for update;

      if v_player_json is null then
        raise exception 'player_not_found' using errcode = 'P0006';
      end if;

      v_old := v_request.old_values;
      for v_key, v_old_value in
        select * from jsonb_each_text(v_old)
      loop
        if (v_player_json->>v_key) is distinct from v_old_value then
          raise exception 'stale_request'
            using errcode = 'P0007',
                  detail  = format('field %s changed', v_key);
        end if;
      end loop;
    end if;

    update public.players
    set
      edad              = coalesce((v_proposed->>'edad')::int, edad),
      status            = coalesce((v_proposed->>'status')::public.player_status, status),
      role_field        = coalesce((v_proposed->>'role_field')::public.player_role_field, role_field),
      position_pref     = coalesce((v_proposed->>'position_pref')::public.position_pref, position_pref),
      technical         = coalesce((v_proposed->>'technical')::int, technical),
      physical          = coalesce((v_proposed->>'physical')::int, physical),
      mental            = coalesce((v_proposed->>'mental')::int, mental),
      rating_confidence = coalesce((v_proposed->>'rating_confidence')::public.rating_confidence, rating_confidence),
      phys_power        = coalesce((v_proposed->>'phys_power')::int, phys_power),
      phys_speed        = coalesce((v_proposed->>'phys_speed')::int, phys_speed),
      phys_stamina      = coalesce((v_proposed->>'phys_stamina')::int, phys_stamina),
      ment_tactical     = coalesce((v_proposed->>'ment_tactical')::int, ment_tactical),
      ment_resilience   = coalesce((v_proposed->>'ment_resilience')::int, ment_resilience),
      ment_attitude     = coalesce((v_proposed->>'ment_attitude')::int, ment_attitude),
      tech_passing      = coalesce((v_proposed->>'tech_passing')::int, tech_passing),
      tech_finishing    = coalesce((v_proposed->>'tech_finishing')::int, tech_finishing),
      tech_linkup       = coalesce((v_proposed->>'tech_linkup')::int, tech_linkup)
    where id = v_request.player_id;

  elsif v_request.action_type = 'deactivate_player' then
    update public.players set status = 'inactive' where id = v_request.player_id;

  elsif v_request.action_type = 'reactivate_player' then
    update public.players set status = 'approved' where id = v_request.player_id;

  else
    raise exception 'unknown_action_type' using errcode = 'P0008';
  end if;

  update public.player_change_requests
  set
    status            = 'approved',
    reviewed_by       = v_caller_id,
    reviewed_at       = now(),
    review_comment    = p_comment,
    created_player_id = case
      when v_request.action_type = 'create_player' then v_new_player_id
      else created_player_id
    end
  where id = p_request_id;

  insert into public.audit_log (actor_id, entity, entity_id, action, payload)
  values (
    v_caller_id,
    'player_change_request',
    p_request_id,
    'approve_change_request',
    jsonb_build_object(
      'action_type',     v_request.action_type,
      'player_id',       coalesce(v_new_player_id, v_request.player_id),
      'requested_by',    v_request.requested_by,
      'old_values',      v_request.old_values,
      'proposed_values', v_request.proposed_values,
      'comment',         p_comment
    )
  );
end;
$$;

comment on function public.approve_player_change_request(uuid, text) is
  'FUT-20 + Fase 9 + FUT-86 2b: única vía para mutar ratings de players. Aplica también los 9 sub-ratings (create_player + update_sensitive_fields). SECURITY DEFINER, atómica, gate del veedor.';
