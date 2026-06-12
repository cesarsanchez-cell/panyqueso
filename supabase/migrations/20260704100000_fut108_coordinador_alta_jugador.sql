-- ============================================================================
-- FUT-108 (Fase 11, 2c-3b): alta group-first del coordinador (crear o vincular)
-- ============================================================================
--
-- El coordinador da de alta un jugador en SU grupo con un form mínimo (nombre +
-- celular + edad). Dedup por celular (1 cel = 1 jugador):
--   - Si el celular YA existe como jugador (cualquier grupo) -> lo VINCULA a su
--     grupo (nueva membresía). El seed (FUT-108 2c-3a) hereda el rating del grupo
--     más reciente. Error si ya es miembro activo de ese grupo.
--   - Si no existe -> crea jugador nuevo APPROVED (auto-aprobado, decisión del
--     usuario: el coordinador tiene autoridad sobre su roster) con ratings 1/1/1;
--     el seed copia de la base. El coordinador después afina el rating por grupo.
--
-- El rol titular/suplente se decide por cupo (idéntico a claim_group_join /
-- addMember). SECURITY DEFINER: el coordinador no puede insertar players por RLS;
-- el gate es can_manage_grupo. Deja traza en audit_log.
--
-- El celular llega normalizado a E164 desde la app (lib/phone.parseArPhone), que
-- es como se guardan los players.phone -> el match de dedup es exacto.
-- ============================================================================

create or replace function public.coordinador_alta_jugador(
  p_grupo_id uuid,
  p_nombre   text,
  p_celular  text,
  p_edad     int
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grupo            public.grupos%rowtype;
  v_player_id        uuid;
  v_linked           boolean := false;
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
  if p_nombre is null or length(trim(p_nombre)) = 0 then
    raise exception 'nombre_required' using errcode = 'P0001';
  end if;
  if p_celular is null or length(trim(p_celular)) = 0 then
    raise exception 'celular_required' using errcode = 'P0001';
  end if;
  if p_edad is null or p_edad < 14 or p_edad > 99 then
    raise exception 'edad_invalid' using errcode = 'P0001';
  end if;

  -- Lock del grupo. Tiene que estar activo.
  select * into v_grupo from public.grupos where id = p_grupo_id for update;
  if not found then
    raise exception 'grupo_not_found' using errcode = 'P0002';
  end if;
  if v_grupo.status <> 'activo' then
    raise exception 'grupo_archived' using errcode = 'P0031';
  end if;

  -- Dedup por celular (1 cel = 1 jugador).
  select id into v_player_id from public.players where phone = p_celular for update;

  if found then
    v_linked := true;
    if exists (
      select 1 from public.grupo_membresias
      where grupo_id = p_grupo_id and player_id = v_player_id and status = 'activo'
    ) then
      raise exception 'already_member' using errcode = 'P0032', detail = v_player_id::text;
    end if;
  else
    -- Jugador nuevo: approved, ratings 1/1/1; el coordinador afina el rating x grupo.
    insert into public.players (
      nombre, edad, phone, role_field, position_pref, positions_possible,
      technical, physical, mental, rating_confidence, status, created_by
    )
    values (
      p_nombre, p_edad, p_celular, 'jugador_campo', 'mediocampista',
      array['mediocampista']::public.position_pref[],
      1, 1, 1, 'baja', 'approved', v_actor
    )
    returning id into v_player_id;
  end if;

  -- Rol en la bolsa por cupo (idéntico a claim_group_join / addMember).
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

  -- El trigger seed (FUT-103 / 2c-3a) crea/hereda el rating del grupo.
  insert into public.grupo_membresias (grupo_id, player_id, tipo, orden, status)
  values (p_grupo_id, v_player_id, v_tipo, v_orden, 'activo');

  insert into public.audit_log (actor_id, entity, entity_id, action, payload)
  values (
    v_actor, 'players', v_player_id, 'coordinador_alta_jugador',
    jsonb_build_object('grupo_id', p_grupo_id, 'linked', v_linked, 'tipo', v_tipo)
  );

  return jsonb_build_object('player_id', v_player_id, 'linked', v_linked);
end;
$$;

comment on function public.coordinador_alta_jugador(uuid, text, text, int) is
  'FUT-108: alta group-first del coordinador. Dedup por celular: vincula si existe (hereda rating), crea approved si no. Gate can_manage_grupo. Audita.';

revoke all on function public.coordinador_alta_jugador(uuid, text, text, int) from public, anon;
grant execute on function public.coordinador_alta_jugador(uuid, text, text, int) to authenticated;
