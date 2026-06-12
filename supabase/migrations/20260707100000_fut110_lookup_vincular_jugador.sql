-- ============================================================================
-- FUT-110 (Fase 11): alta de jugador en dos pasos — lookup + vincular
-- ============================================================================
--
-- El flujo "Agregar jugador" (admin/coordinador) pasa a ser de dos pasos:
--   Paso 1: se busca por CELULAR.
--     - Si existe        -> se muestran sus datos seguros y se VINCULA al grupo.
--     - Si no existe     -> se lo INVITA a completar su ficha (flujo de invites,
--                           no toca esta migración: es app-layer).
--
-- Esta migración agrega las dos funciones del paso "existe":
--
--   lookup_jugador_por_celular(grupo, celular) -> jsonb
--     Busca un jugador por celular BYPASSEANDO RLS (dedup global: 1 cel = 1
--     jugador, esté en el grupo que esté). Solo devuelve campos SEGUROS para
--     confirmar identidad (nombre, apodo, foto) — NUNCA ratings ni de qué otros
--     grupos es. Gate can_manage_grupo del grupo destino.
--
--   vincular_jugador_a_grupo(grupo, celular) -> jsonb
--     Suma al jugador existente como miembro activo del grupo. El seed
--     (grupo_membresias_seed_rating) hereda el rating del grupo más reciente.
--     Gate can_manage_grupo. Error si ya es miembro activo (P0032) o si no existe
--     (P0033: el caller debe invitarlo en su lugar). Audita.
--
-- Es la mitad "vínculo" del viejo coordinador_alta_jugador, sin la rama de
-- creación (los jugadores nuevos ahora se crean por invitación, donde el propio
-- jugador completa su ficha y nace con rating neutro 6 — FUT-110 PR 1).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. lookup_jugador_por_celular: ¿existe ese celular? datos seguros
-- ---------------------------------------------------------------------------
create or replace function public.lookup_jugador_por_celular(
  p_grupo_id uuid,
  p_celular  text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_player        public.players%rowtype;
  v_already_member boolean;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = 'P0001';
  end if;
  if not public.can_manage_grupo(p_grupo_id) then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;
  if p_celular is null or length(trim(p_celular)) = 0 then
    raise exception 'celular_required' using errcode = 'P0001';
  end if;

  -- Dedup global (1 cel = 1 jugador). SECURITY DEFINER => encuentra al jugador
  -- esté en el grupo que esté, sin exponer la tabla por RLS.
  select * into v_player from public.players where phone = p_celular;

  if not found then
    return jsonb_build_object('exists', false);
  end if;

  v_already_member := exists (
    select 1 from public.grupo_membresias
    where grupo_id = p_grupo_id and player_id = v_player.id and status = 'activo'
  );

  -- Solo campos seguros para confirmar identidad. Sin ratings, sin otros grupos.
  return jsonb_build_object(
    'exists', true,
    'player_id', v_player.id,
    'nombre', v_player.nombre,
    'apodo', v_player.apodo,
    'avatar_url', v_player.avatar_url,
    'already_member', v_already_member
  );
end;
$$;

comment on function public.lookup_jugador_por_celular(uuid, text) is
  'FUT-110: busca un jugador por celular (dedup global, bypass RLS) para el alta en dos pasos. Devuelve solo campos seguros (nombre/apodo/foto) + already_member. Gate can_manage_grupo.';

revoke all on function public.lookup_jugador_por_celular(uuid, text) from public, anon;
grant execute on function public.lookup_jugador_por_celular(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. vincular_jugador_a_grupo: suma al existente, hereda rating
-- ---------------------------------------------------------------------------
create or replace function public.vincular_jugador_a_grupo(
  p_grupo_id uuid,
  p_celular  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grupo            public.grupos%rowtype;
  v_player_id        uuid;
  v_nombre           text;
  v_titulares_count  int;
  v_max_suplente     int;
  v_tipo             public.membresia_tipo;
  v_orden            int;
  v_actor            uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'auth_required' using errcode = 'P0001';
  end if;
  if not public.can_manage_grupo(p_grupo_id) then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;
  if p_celular is null or length(trim(p_celular)) = 0 then
    raise exception 'celular_required' using errcode = 'P0001';
  end if;

  -- Lock del grupo. Tiene que existir y estar activo.
  select * into v_grupo from public.grupos where id = p_grupo_id for update;
  if not found then
    raise exception 'grupo_not_found' using errcode = 'P0002';
  end if;
  if v_grupo.status <> 'activo' then
    raise exception 'grupo_archived' using errcode = 'P0031';
  end if;

  -- El jugador tiene que existir (dedup por celular). Si no, el caller invita.
  select id, nombre into v_player_id, v_nombre
  from public.players where phone = p_celular for update;
  if not found then
    raise exception 'player_not_found' using errcode = 'P0033';
  end if;

  if exists (
    select 1 from public.grupo_membresias
    where grupo_id = p_grupo_id and player_id = v_player_id and status = 'activo'
  ) then
    raise exception 'already_member' using errcode = 'P0032', detail = v_player_id::text;
  end if;

  -- Rol en la bolsa por cupo (idéntico a claim_invite / addMember).
  select count(*) into v_titulares_count
  from public.grupo_membresias
  where grupo_id = p_grupo_id and tipo = 'titular' and status = 'activo';

  if v_titulares_count < v_grupo.cupo_titulares then
    v_tipo := 'titular';
    v_orden := null;
  else
    select coalesce(max(orden), 0) into v_max_suplente
    from public.grupo_membresias
    where grupo_id = p_grupo_id and tipo = 'suplente' and status = 'activo';
    v_tipo := 'suplente';
    v_orden := v_max_suplente + 1;
  end if;

  -- El trigger seed crea/hereda el rating del grupo (on conflict do nothing:
  -- re-ingresar CONSERVA el rating afinado).
  insert into public.grupo_membresias (grupo_id, player_id, tipo, orden, status)
  values (p_grupo_id, v_player_id, v_tipo, v_orden, 'activo');

  insert into public.audit_log (actor_id, entity, entity_id, action, payload)
  values (
    v_actor, 'players', v_player_id, 'vincular_jugador_a_grupo',
    jsonb_build_object('grupo_id', p_grupo_id, 'tipo', v_tipo)
  );

  return jsonb_build_object('player_id', v_player_id, 'nombre', v_nombre, 'tipo', v_tipo);
end;
$$;

comment on function public.vincular_jugador_a_grupo(uuid, text) is
  'FUT-110: vincula un jugador EXISTENTE (por celular) como miembro activo del grupo, heredando su rating. Gate can_manage_grupo. P0032 si ya es miembro, P0033 si no existe (invitar en su lugar). Audita.';

revoke all on function public.vincular_jugador_a_grupo(uuid, text) from public, anon;
grant execute on function public.vincular_jugador_a_grupo(uuid, text) to authenticated;
