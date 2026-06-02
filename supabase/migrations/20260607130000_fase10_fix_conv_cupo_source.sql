-- ============================================================================
-- Fase 10 fix: las RPCs de roster del jugador deben usar el cupo de la
--              CONVOCATORIA (cupo_maximo), no el del grupo (cupo_titulares)
-- ============================================================================
--
-- Bug reportado: "me bajo de un partido, vuelvo a subirme y entro como titular
-- aunque haya suplentes esperando".
--
-- Causa: player_undo_decline_convocatoria y player_join_open_convocatoria
-- decidian titular/suplente comparando contra grupos.cupo_titulares. Antes de
-- Fase 10 ese valor SIEMPRE coincidia con convocatorias.cupo_maximo (se copiaba
-- al crear la conv), asi que no importaba. Pero Fase 10 permite editar el cupo
-- POR convocatoria (set_convocatoria_cupo). Si el admin baja el cupo de la conv
-- (ej. grupo=14, conv=12), al volver: hay 12 titulares, 12 < 12 (conv) seria
-- suplente correctamente, pero comparando contra el grupo 12 < 14 -> titular.
--
-- Fix: ambas funciones usan convocatorias.cupo_maximo. El grupo sigue siendo
-- solo el default al crear la convocatoria.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- player_undo_decline_convocatoria: usa cupo_maximo de la conv.
-- ----------------------------------------------------------------------------
create or replace function public.player_undo_decline_convocatoria(p_convocatoria_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id       uuid;
  v_cp_id           uuid;
  v_cp_status       public.attendance_status;
  v_conv_status     public.convocatoria_status;
  v_conv_grupo_id   uuid;
  v_cupo_maximo     int;
  v_titulares_count int;
  v_next_orden      int;
  v_tipo            public.membresia_tipo;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'not_a_player' using errcode = 'P0040';
  end if;

  select status, grupo_id, cupo_maximo
    into v_conv_status, v_conv_grupo_id, v_cupo_maximo
    from public.convocatorias
   where id = p_convocatoria_id;
  if not found then
    raise exception 'convocatoria_not_found' using errcode = 'P0053';
  end if;
  if v_conv_status <> 'abierta' then
    raise exception 'convocatoria_not_open'
      using errcode = 'P0057', detail = v_conv_status::text;
  end if;

  select id, attendance_status
    into v_cp_id, v_cp_status
    from public.convocatoria_players
   where convocatoria_id = p_convocatoria_id
     and player_id = v_player_id
   for update;

  if not found then
    raise exception 'not_invited' using errcode = 'P0041';
  end if;

  if v_cp_status <> 'declinado' then
    return (
      select rol_en_convocatoria::text
        from public.convocatoria_players
       where id = v_cp_id
    );
  end if;

  if v_conv_grupo_id is null then
    update public.convocatoria_players
       set attendance_status = 'confirmado',
           rol_en_convocatoria = 'titular',
           orden_suplente = null,
           updated_at = now()
     where id = v_cp_id;
    return 'titular';
  end if;

  select count(*) into v_titulares_count
    from public.convocatoria_players
   where convocatoria_id = p_convocatoria_id
     and rol_en_convocatoria = 'titular'
     and attendance_status <> 'declinado';

  -- Cupo de la CONVOCATORIA (no del grupo).
  if v_titulares_count < v_cupo_maximo then
    v_tipo := 'titular';
    update public.convocatoria_players
       set attendance_status = 'confirmado',
           rol_en_convocatoria = 'titular',
           orden_suplente = null,
           updated_at = now()
     where id = v_cp_id;
  else
    v_tipo := 'suplente';
    select coalesce(max(orden_suplente), 0) + 1 into v_next_orden
      from public.convocatoria_players
     where convocatoria_id = p_convocatoria_id
       and rol_en_convocatoria = 'suplente'
       and attendance_status <> 'declinado';
    update public.convocatoria_players
       set attendance_status = 'confirmado',
           rol_en_convocatoria = 'suplente',
           orden_suplente = v_next_orden,
           updated_at = now()
     where id = v_cp_id;
  end if;

  return v_tipo::text;
end;
$$;

comment on function public.player_undo_decline_convocatoria(uuid) is
  'Fase 10: el jugador vuelve a la convocatoria. Solo con conv abierta (P0057). Titular si hay cupo de titular libre SEGUN convocatorias.cupo_maximo (no el del grupo); sino al final de la cola de suplentes.';

revoke all on function public.player_undo_decline_convocatoria(uuid) from public;
grant execute on function public.player_undo_decline_convocatoria(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- player_join_open_convocatoria: usa cupo_maximo de la conv.
-- ----------------------------------------------------------------------------
create or replace function public.player_join_open_convocatoria(p_convocatoria_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id       uuid;
  v_conv            public.convocatorias%rowtype;
  v_existing_cp_id  uuid;
  v_existing_status public.attendance_status;
  v_in_grupo        boolean;
  v_titulares_count int;
  v_next_orden      int;
  v_tipo            public.membresia_tipo;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'not_a_player' using errcode = 'P0040';
  end if;

  select * into v_conv from public.convocatorias where id = p_convocatoria_id;
  if not found then
    raise exception 'convocatoria_not_found' using errcode = 'P0053';
  end if;
  if v_conv.status <> 'abierta' then
    raise exception 'convocatoria_not_open' using errcode = 'P0057', detail = v_conv.status::text;
  end if;
  if v_conv.grupo_id is null then
    raise exception 'convocatoria_sin_grupo' using errcode = 'P0053';
  end if;

  -- Player debe estar activo en el grupo.
  select exists (
    select 1 from public.grupo_membresias
     where grupo_id = v_conv.grupo_id
       and player_id = v_player_id
       and status = 'activo'
  ) into v_in_grupo;
  if not v_in_grupo then
    raise exception 'not_in_grupo' using errcode = 'P0044';
  end if;

  -- Si ya tiene fila en la conv, manejamos por estado.
  select id, attendance_status
    into v_existing_cp_id, v_existing_status
    from public.convocatoria_players
   where convocatoria_id = p_convocatoria_id
     and player_id = v_player_id
   for update;

  if found and v_existing_status <> 'declinado' then
    raise exception 'already_in_convocatoria' using errcode = 'P0059';
  end if;

  -- Decidir rol segun el cupo de la CONVOCATORIA (no del grupo).
  select count(*) into v_titulares_count
    from public.convocatoria_players
   where convocatoria_id = p_convocatoria_id
     and rol_en_convocatoria = 'titular'
     and attendance_status <> 'declinado';

  if v_titulares_count < v_conv.cupo_maximo then
    v_tipo := 'titular';
    v_next_orden := null;
  else
    v_tipo := 'suplente';
    select coalesce(max(orden_suplente), 0) + 1 into v_next_orden
      from public.convocatoria_players
     where convocatoria_id = p_convocatoria_id
       and rol_en_convocatoria = 'suplente'
       and attendance_status <> 'declinado';
  end if;

  if v_existing_cp_id is not null then
    -- Tenia fila declinada: la reactivamos.
    update public.convocatoria_players
       set attendance_status = 'confirmado',
           rol_en_convocatoria = v_tipo,
           orden_suplente = v_next_orden,
           updated_at = now()
     where id = v_existing_cp_id;
  else
    insert into public.convocatoria_players (
      convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
    )
    values (
      p_convocatoria_id, v_player_id, 'confirmado', v_tipo, v_next_orden
    );
  end if;

  return v_tipo::text;
end;
$$;

comment on function public.player_join_open_convocatoria(uuid) is
  'Fase 10: el jugador del grupo se anota a una convocatoria abierta. Titular si hay cupo SEGUN convocatorias.cupo_maximo (no el del grupo); sino suplente al final.';

revoke all on function public.player_join_open_convocatoria(uuid) from public;
grant execute on function public.player_join_open_convocatoria(uuid) to authenticated;
