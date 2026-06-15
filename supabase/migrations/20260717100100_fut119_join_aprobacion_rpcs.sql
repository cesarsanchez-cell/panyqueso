-- ============================================================================
-- FUT-119 (Fase 13 / F1): RPCs del gate de aprobación del link /g
-- ============================================================================
--
--  - get_group_by_join_token: agrega grupo_requiere_aprobacion (para que el
--    landing y el action sepan si el alta queda pendiente).
--  - claim_group_join: si el grupo requiere aprobación → crea player PENDING +
--    fila en grupo_join_requests, SIN membresía (no se cuela en convocatorias).
--    Si no → comportamiento histórico (approved + membresía, ratings 6/6/6).
--  - listar_join_requests / aprobar_join_request / rechazar_join_request:
--    cola del admin (gate can_manage_grupo). Aprobar crea la membresía por cupo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. get_group_by_join_token + flag de aprobación
-- ---------------------------------------------------------------------------
-- Cambia el tipo de retorno (agrega una columna) → no se puede con CREATE OR
-- REPLACE; hay que dropear primero. No tiene dependencias en la base (se llama
-- desde el server action), así que el drop es seguro.
drop function if exists public.get_group_by_join_token(text);

create or replace function public.get_group_by_join_token(p_token text)
returns table (
  grupo_id                  uuid,
  grupo_nombre              text,
  grupo_dia_semana          int,
  grupo_hora                time,
  grupo_cupo_titulares      int,
  grupo_requiere_aprobacion boolean,
  lugar_nombre              text,
  lugar_google_maps_url     text
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    g.id,
    g.nombre,
    g.dia_semana,
    g.hora,
    g.cupo_titulares,
    g.join_requiere_aprobacion,
    l.nombre,
    l.google_maps_url
  from public.grupos g
  join public.lugares l on l.id = g.lugar_id
  where g.join_token = p_token
    and g.status = 'activo'
  limit 1
$$;

revoke all on function public.get_group_by_join_token(text) from public;
grant execute on function public.get_group_by_join_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. claim_group_join con gate de aprobación
-- ---------------------------------------------------------------------------
create or replace function public.claim_group_join(
  p_token            text,
  p_auth_user_id     uuid,
  p_phone            text,
  p_nombre           text,
  p_fecha_nacimiento date,
  p_edad             int,
  p_role_field       public.player_role_field,
  p_position_pref    public.position_pref
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grupo            public.grupos%rowtype;
  v_existing_phone   uuid;
  v_titulares_count  int;
  v_max_suplente     int;
  v_new_player_id    uuid;
  v_tipo             public.membresia_tipo;
  v_orden            int;
begin
  select * into v_grupo
  from public.grupos
  where join_token = p_token
  for update;

  if not found then
    raise exception 'join_token_not_found' using errcode = 'P0030';
  end if;
  if v_grupo.status <> 'activo' then
    raise exception 'grupo_archived' using errcode = 'P0031';
  end if;

  select id into v_existing_phone
  from public.players
  where phone = p_phone
  for update;

  if found then
    raise exception 'phone_collision'
      using errcode = 'P0024',
            detail  = p_phone;
  end if;

  insert into public.profiles (id, nombre, role)
  values (p_auth_user_id, p_nombre, 'player')
  on conflict (id) do update
    set nombre = excluded.nombre,
        role   = 'player';

  -- El jugador nace approved (auto) o pending (si el grupo requiere aprobación).
  insert into public.players (
    nombre, edad, fecha_nacimiento, phone, auth_user_id,
    role_field, position_pref, positions_possible,
    technical, physical, mental, rating_confidence,
    status, created_by
  )
  values (
    p_nombre,
    p_edad,
    p_fecha_nacimiento,
    p_phone,
    p_auth_user_id,
    p_role_field,
    p_position_pref,
    array[p_position_pref]::public.position_pref[],
    6, 6, 6,           -- NEUTRO (FUT-110); confianza baja = sin calibrar
    'baja',
    case when v_grupo.join_requiere_aprobacion then 'pending'::public.player_status
         else 'approved'::public.player_status end,
    v_grupo.owner_id
  )
  returning id into v_new_player_id;

  -- Si requiere aprobación: NO se crea membresía (no se cuela en convocatorias).
  -- Sólo queda la solicitud para que el admin la apruebe.
  if v_grupo.join_requiere_aprobacion then
    insert into public.grupo_join_requests (grupo_id, player_id)
    values (v_grupo.id, v_new_player_id);
    return v_new_player_id;
  end if;

  -- Auto-aprobado: membresía por cupo (idéntico al flujo histórico).
  select count(*) into v_titulares_count
  from public.grupo_membresias
  where grupo_id = v_grupo.id
    and tipo = 'titular'
    and status = 'activo';

  if v_titulares_count < v_grupo.cupo_titulares then
    v_tipo := 'titular';
    v_orden := null;
  else
    select coalesce(max(orden), 0) into v_max_suplente
    from public.grupo_membresias
    where grupo_id = v_grupo.id
      and tipo = 'suplente'
      and status = 'activo';
    v_tipo := 'suplente';
    v_orden := v_max_suplente + 1;
  end if;

  insert into public.grupo_membresias (grupo_id, player_id, tipo, orden, status)
  values (v_grupo.id, v_new_player_id, v_tipo, v_orden, 'activo');

  return v_new_player_id;
end;
$$;

revoke all on function public.claim_group_join(text, uuid, text, text, date, int, public.player_role_field, public.position_pref) from public, anon, authenticated;
grant execute on function public.claim_group_join(text, uuid, text, text, date, int, public.player_role_field, public.position_pref) to service_role;

-- ---------------------------------------------------------------------------
-- 3. listar_join_requests: cola del admin (solo pendientes), gate can_manage
-- ---------------------------------------------------------------------------
create or replace function public.listar_join_requests(p_grupo_id uuid)
returns table (
  request_id uuid,
  player_id  uuid,
  nombre     text,
  phone      text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not public.can_manage_grupo(p_grupo_id) then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;

  return query
  select r.id, p.id, p.nombre, p.phone, r.created_at
    from public.grupo_join_requests r
    join public.players p on p.id = r.player_id
   where r.grupo_id = p_grupo_id
     and r.status = 'pendiente'
   order by r.created_at asc;
end;
$$;

revoke all on function public.listar_join_requests(uuid) from public, anon;
grant execute on function public.listar_join_requests(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. aprobar_join_request: player -> approved + membresía por cupo
-- ---------------------------------------------------------------------------
create or replace function public.aprobar_join_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req              public.grupo_join_requests%rowtype;
  v_grupo            public.grupos%rowtype;
  v_titulares_count  int;
  v_max_suplente     int;
  v_tipo             public.membresia_tipo;
  v_orden            int;
begin
  select * into v_req from public.grupo_join_requests where id = p_request_id for update;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0053';
  end if;
  if not public.can_manage_grupo(v_req.grupo_id) then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;
  if v_req.status <> 'pendiente' then
    raise exception 'request_not_pending' using errcode = 'P0057', detail = v_req.status::text;
  end if;

  select * into v_grupo from public.grupos where id = v_req.grupo_id for update;
  if v_grupo.status <> 'activo' then
    raise exception 'grupo_archived' using errcode = 'P0031';
  end if;

  update public.players set status = 'approved', updated_at = now()
   where id = v_req.player_id;

  -- Membresía por cupo (idéntico a claim_group_join). Si ya es miembro activo
  -- (caso raro), el unique parcial lo evita → on conflict do nothing.
  select count(*) into v_titulares_count
  from public.grupo_membresias
  where grupo_id = v_grupo.id and tipo = 'titular' and status = 'activo';

  if v_titulares_count < v_grupo.cupo_titulares then
    v_tipo := 'titular';
    v_orden := null;
  else
    select coalesce(max(orden), 0) into v_max_suplente
    from public.grupo_membresias
    where grupo_id = v_grupo.id and tipo = 'suplente' and status = 'activo';
    v_tipo := 'suplente';
    v_orden := v_max_suplente + 1;
  end if;

  insert into public.grupo_membresias (grupo_id, player_id, tipo, orden, status)
  values (v_grupo.id, v_req.player_id, v_tipo, v_orden, 'activo')
  on conflict do nothing;

  update public.grupo_join_requests
     set status = 'aprobada', resolved_at = now(), resolved_by = auth.uid()
   where id = p_request_id;

  return v_req.player_id;
end;
$$;

revoke all on function public.aprobar_join_request(uuid) from public, anon;
grant execute on function public.aprobar_join_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. rechazar_join_request: player -> inactive, solicitud rechazada
-- ---------------------------------------------------------------------------
create or replace function public.rechazar_join_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.grupo_join_requests%rowtype;
begin
  select * into v_req from public.grupo_join_requests where id = p_request_id for update;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0053';
  end if;
  if not public.can_manage_grupo(v_req.grupo_id) then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;
  if v_req.status <> 'pendiente' then
    raise exception 'request_not_pending' using errcode = 'P0057', detail = v_req.status::text;
  end if;

  update public.players set status = 'inactive', updated_at = now()
   where id = v_req.player_id;

  update public.grupo_join_requests
     set status = 'rechazada', resolved_at = now(), resolved_by = auth.uid()
   where id = p_request_id;
end;
$$;

revoke all on function public.rechazar_join_request(uuid) from public, anon;
grant execute on function public.rechazar_join_request(uuid) to authenticated;
