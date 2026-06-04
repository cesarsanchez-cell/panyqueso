-- ============================================================================
-- Link único de grupo: auto-inscripción por capability token
-- ============================================================================
--
-- Hoy invitar a alguien obliga a conocer su celular de antemano (invite por
-- teléfono o import masivo). Esto agrega un MODELO ALTERNATIVO: un link único
-- por grupo que el admin pega una sola vez en el grupo de WhatsApp. Cualquiera
-- que lo abra se anota solo (pone su celu + nombre + datos de jugador).
--
-- Diseño:
--   - grupos.join_token: capability token. NULL = sin link activo. El admin
--     lo genera/regenera/desactiva desde el detalle del grupo. Regenerar
--     invalida el link viejo (rota el token).
--   - Acceso público a /g/<token> via get_group_by_join_token (SECURITY
--     DEFINER), igual patrón que get_invite_by_token: no se expone la tabla
--     al rol anon.
--   - El alta se hace con claim_group_join (SECURITY DEFINER), espejo de
--     claim_invite pero el teléfono lo aporta la persona (no hay invite row).
--   - Decisión de producto: el que entra por el link queda APPROVED directo
--     (mismo criterio que el invite por teléfono). El admin puede desactivarlo
--     después. Ratings 1/1/1 hasta que admin proponga + veedor apruebe.
--
-- El link sólo funciona si el grupo está activo. Si se archiva, deja de andar.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Columna join_token en grupos
-- ---------------------------------------------------------------------------
alter table public.grupos
  add column if not exists join_token text;

-- Unique parcial: dos grupos no pueden compartir token; NULL no cuenta.
create unique index if not exists grupos_join_token_unique
  on public.grupos (join_token)
  where join_token is not null;

-- Largo mínimo para que el token sirva como capability (igual que invitations).
alter table public.grupos
  drop constraint if exists grupos_join_token_len_chk;
alter table public.grupos
  add constraint grupos_join_token_len_chk
  check (join_token is null or length(join_token) >= 16);

comment on column public.grupos.join_token is
  'Capability token del link único de auto-inscripción (/g/<token>). NULL = sin link activo. Quien tenga el link puede anotarse en el grupo (si está activo).';

-- ---------------------------------------------------------------------------
-- 2. get_group_by_join_token: lookup público por token (sin login)
-- ---------------------------------------------------------------------------
-- Sólo devuelve el grupo si está ACTIVO. Grupo archivado => 0 rows => la
-- página muestra "link no válido". Expone únicamente columnas safe.
create or replace function public.get_group_by_join_token(p_token text)
returns table (
  grupo_id              uuid,
  grupo_nombre          text,
  grupo_dia_semana      int,
  grupo_hora            time,
  grupo_cupo_titulares  int,
  lugar_nombre          text,
  lugar_google_maps_url text
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
    l.nombre,
    l.google_maps_url
  from public.grupos g
  join public.lugares l on l.id = g.lugar_id
  where g.join_token = p_token
    and g.status = 'activo'
  limit 1
$$;

comment on function public.get_group_by_join_token(text) is
  'Lookup público del grupo por join_token. Llamado desde /g/<token> sin login. Sólo grupos activos. Expone columnas safe.';

revoke all on function public.get_group_by_join_token(text) from public;
grant execute on function public.get_group_by_join_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. claim_group_join: alta atómica vía link de grupo
-- ---------------------------------------------------------------------------
-- Espejo de claim_invite, pero sin invite row: el teléfono lo aporta la
-- persona. Crea profile + player (approved, ratings 1/1/1) + membresía. El
-- rol titular/suplente se decide por cupo, igual que el resto del flujo.
--
-- Se llama desde el server action con el admin client (service_role), después
-- de crear el auth.user. NO se otorga a anon: un anon no puede llamar esto.
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
  -- Lock del grupo por token. Valida que el link exista y el grupo esté activo.
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

  -- Un celular = un jugador. Si ya existe, abortar (el caller manda a /login).
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
    1, 1, 1,
    'baja',
    'approved',            -- mismo criterio que claim_invite
    v_grupo.owner_id       -- "creado por" = dueño del grupo
  )
  returning id into v_new_player_id;

  -- Rol en la bolsa por cupo (idéntico a claim_invite / addMember).
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

  -- El trigger sync_open_conv se encarga de meterlo en la convocatoria abierta
  -- si corresponde (mismo comportamiento que agregar un miembro a mano).
  insert into public.grupo_membresias (grupo_id, player_id, tipo, orden, status)
  values (v_grupo.id, v_new_player_id, v_tipo, v_orden, 'activo');

  return v_new_player_id;
end;
$$;

comment on function public.claim_group_join(text, uuid, text, text, date, int, public.player_role_field, public.position_pref) is
  'Alta atómica vía link único de grupo. Crea player approved + membresía. El teléfono lo aporta la persona. Se invoca con service_role desde el server action.';

revoke all on function public.claim_group_join(text, uuid, text, text, date, int, public.player_role_field, public.position_pref) from public, anon, authenticated;
grant execute on function public.claim_group_join(text, uuid, text, text, date, int, public.player_role_field, public.position_pref) to service_role;
