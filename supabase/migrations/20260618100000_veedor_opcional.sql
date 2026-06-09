-- ============================================================================
-- Veedor opcional: el admin decide si los cambios de rating se auditan
-- ============================================================================
--
-- En grupos chicos el gate del veedor agrega fricción sin tanto valor. Este
-- parámetro (app-level, global) deja que el ADMIN decida si las puntuaciones
-- pasan por el veedor o se aplican directo.
--
--   - requiere_veedor = true  → como hasta hoy: el admin propone, el veedor
--                                aprueba (approve_player_change_request).
--   - requiere_veedor = false → el cambio se aplica directo
--                                (admin_apply_sensitive_change), SIN perder la
--                                traza: queda la solicitud marcada como aplicada
--                                + el registro en audit_log.
--
-- Decisiones: alcance GLOBAL (el rating es uno por jugador; el veedor es rol a
-- nivel app, no por grupo). Arranca DESACTIVADO. Las solicitudes pendientes al
-- togglear se dejan como están (no se auto-aplican).
--
-- Para no duplicar la lógica de aplicación de ratings (los 9 sub + dimensiones),
-- se extrae el núcleo de approve_player_change_request a un helper interno
-- _apply_change_request, que llaman tanto approve (gate veedor) como
-- admin_apply (gate off). approve conserva exactamente sus chequeos y errcodes.
--
-- Códigos nuevos:
--   P0012: gate_active  → admin_apply pedido con requiere_veedor = true.
--   P0013: not_an_admin → set_requiere_veedor / admin_apply por no-admin.
-- ============================================================================

-- 1. Settings de la app (una sola fila) -------------------------------------
create table if not exists public.app_settings (
  id              boolean primary key default true check (id),
  requiere_veedor boolean not null default false,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id) on delete set null
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- SELECT: cualquier autenticado (la UI condiciona el flujo según el valor).
-- UPDATE/INSERT/DELETE: sin policy => solo vía RPC SECURITY DEFINER.
drop policy if exists app_settings_select_all on public.app_settings;
create policy app_settings_select_all on public.app_settings
  for select to authenticated using (true);

grant select on public.app_settings to authenticated;

-- 2. Helper de lectura -------------------------------------------------------
create or replace function public.requiere_veedor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select requiere_veedor from public.app_settings where id), false);
$$;

comment on function public.requiere_veedor() is
  'Veedor opcional: true si los cambios de rating deben pasar por el veedor. Default false.';

revoke all on function public.requiere_veedor() from public;
grant execute on function public.requiere_veedor() to authenticated;

-- 3. Toggle (solo admin) -----------------------------------------------------
create or replace function public.set_requiere_veedor(p_value boolean)
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

  update public.app_settings
     set requiere_veedor = p_value,
         updated_at = now(),
         updated_by = v_caller_id
   where id;

  insert into public.audit_log (actor_id, entity, entity_id, action, payload)
  values (
    v_caller_id, 'app_settings', null, 'set_requiere_veedor',
    jsonb_build_object('requiere_veedor', p_value)
  );
end;
$$;

comment on function public.set_requiere_veedor(boolean) is
  'Veedor opcional: el admin activa/desactiva el gate del veedor para cambios de rating. Audita el cambio.';

revoke all on function public.set_requiere_veedor(boolean) from public;
grant execute on function public.set_requiere_veedor(boolean) to authenticated;

-- 4. Núcleo de aplicación (interno) -----------------------------------------
-- Aplica una solicitud (create_player / update_sensitive_fields / de/reactivate),
-- marca la solicitud aprobada (atribuida a p_actor_id) y registra en audit_log
-- con la acción p_action. Es el mismo motor que usaba approve; sin chequeo de
-- rol acá (lo hace cada caller). Solo llamable desde otras funciones SECURITY
-- DEFINER (revocado para clientes).
create or replace function public._apply_change_request(
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
  v_request       public.player_change_requests;
  v_player_json   jsonb;
  v_proposed      jsonb;
  v_old           jsonb;
  v_key           text;
  v_old_value     text;
  v_new_player_id uuid;
begin
  select * into v_request
  from public.player_change_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  if v_request.status not in ('pending', 'flagged') then
    raise exception 'invalid_status' using errcode = 'P0004';
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
    reviewed_by       = p_actor_id,
    reviewed_at       = now(),
    review_comment    = p_comment,
    created_player_id = case
      when v_request.action_type = 'create_player' then v_new_player_id
      else created_player_id
    end
  where id = p_request_id;

  insert into public.audit_log (actor_id, entity, entity_id, action, payload)
  values (
    p_actor_id,
    'player_change_request',
    p_request_id,
    p_action,
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

comment on function public._apply_change_request(uuid, uuid, text, text) is
  'Veedor opcional: núcleo de aplicación de una solicitud (ratings v2). Lo llaman approve (gate veedor) y admin_apply (gate off). Interno: solo SECURITY DEFINER.';

revoke all on function public._apply_change_request(uuid, uuid, text, text) from public;

-- 5. approve_player_change_request: ahora delega el apply al helper ----------
-- Conserva exactamente los chequeos del veedor (rol, estado, no-propia) y sus
-- errcodes; solo el cuerpo de aplicación se movió al helper.
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

  perform public._apply_change_request(p_request_id, v_caller_id, p_comment, 'approve_change_request');
end;
$$;

comment on function public.approve_player_change_request(uuid, text) is
  'FUT-20 + Fase 9 + FUT-86 + veedor-opcional: gate del veedor. Valida rol/estado/no-propia y delega la aplicación a _apply_change_request.';

-- 6. admin_apply_sensitive_change: aplica directo cuando el gate está off ----
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
  v_status      public.change_request_status;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'auth_required' using errcode = 'P0001';
  end if;

  -- Solo cuando el gate está apagado (si está prendido, va por el veedor).
  if public.requiere_veedor() then
    raise exception 'gate_active' using errcode = 'P0012';
  end if;

  select role into v_caller_role
  from public.profiles
  where id = v_caller_id;

  if v_caller_role is null or v_caller_role <> 'admin' then
    raise exception 'not_an_admin' using errcode = 'P0013';
  end if;

  select status into v_status
  from public.player_change_requests
  where id = p_request_id;

  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if v_status not in ('pending', 'flagged') then
    raise exception 'invalid_status' using errcode = 'P0004';
  end if;

  -- Sin restricción de "no-propia": el sentido es que el admin aplique su
  -- propio cambio directo cuando el gate está off.
  perform public._apply_change_request(p_request_id, v_caller_id, p_comment, 'admin_apply_direct');
end;
$$;

comment on function public.admin_apply_sensitive_change(uuid, text) is
  'Veedor opcional: el admin aplica directo una solicitud de rating cuando requiere_veedor=false. Mantiene la traza (solicitud aprobada + audit_log).';

revoke all on function public.admin_apply_sensitive_change(uuid, text) from public;
grant execute on function public.admin_apply_sensitive_change(uuid, text) to authenticated;
