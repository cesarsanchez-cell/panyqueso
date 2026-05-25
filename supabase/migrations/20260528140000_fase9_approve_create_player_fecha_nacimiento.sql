-- ============================================================================
-- Fase 9: approve_player_change_request guarda fecha_nacimiento en create_player
-- ============================================================================
--
-- Contexto:
--   El form /jugadores/nuevo (PR de alta original, FUT-20) pide la edad como
--   numero entero. En Fase 9 PR 1 agregamos players.fecha_nacimiento como
--   reemplazo gradual: para players legacy se backfilleo con make_date(year-edad,1,1),
--   pero los players NUEVOS que se den de alta despues de Fase 9 deberian
--   tener fecha_nacimiento real.
--
-- Cambio:
--   El form pasa a pedir fecha_nacimiento (date). El server action computa
--   edad derivada (para mantener compat con compute_internal_score, que
--   sigue usando edad) y pone AMBOS en proposed_values.
--
--   Esta migracion extiende el branch create_player de
--   approve_player_change_request para que el INSERT en players tambien
--   guarde fecha_nacimiento si viene en proposed_values.
--
-- Resto del cuerpo: identico al original (20260522124854). Mantengo el resto
-- sin cambios para minimizar superficie de revision.
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
  -- 0. Auth ----------------------------------------------------------------
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'auth_required' using errcode = 'P0001';
  end if;

  -- 1. Cargar request con lock --------------------------------------------
  select * into v_request
  from public.player_change_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  -- 2. Rol del caller ------------------------------------------------------
  select role into v_caller_role
  from public.profiles
  where id = v_caller_id;

  if v_caller_role is null or v_caller_role <> 'veedor' then
    raise exception 'not_a_veedor' using errcode = 'P0003';
  end if;

  -- 3. Estado del request -------------------------------------------------
  if v_request.status not in ('pending', 'flagged') then
    raise exception 'invalid_status' using errcode = 'P0004';
  end if;

  -- 4. Reviewer != Requester ----------------------------------------------
  if v_request.requested_by = v_caller_id then
    raise exception 'cannot_approve_own_request' using errcode = 'P0005';
  end if;

  -- 5. Aplicar segun action_type ------------------------------------------
  perform set_config('app.applying_change_request', 'true', true);

  v_proposed := v_request.proposed_values;

  if v_request.action_type = 'create_player' then
    insert into public.players (
      nombre, edad, fecha_nacimiento, role_field, position_pref, positions_possible,
      technical, physical, mental, rating_confidence,
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
      rating_confidence = coalesce((v_proposed->>'rating_confidence')::public.rating_confidence, rating_confidence)
    where id = v_request.player_id;

  elsif v_request.action_type = 'deactivate_player' then
    update public.players set status = 'inactive' where id = v_request.player_id;

  elsif v_request.action_type = 'reactivate_player' then
    update public.players set status = 'approved' where id = v_request.player_id;

  else
    raise exception 'unknown_action_type' using errcode = 'P0008';
  end if;

  -- 6. Marcar el request como approved ------------------------------------
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

  -- 7. Auditoria -----------------------------------------------------------
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
  'FUT-20 + Fase 9: aprobar request de cambio. create_player ahora guarda fecha_nacimiento si viene en proposed_values.';
