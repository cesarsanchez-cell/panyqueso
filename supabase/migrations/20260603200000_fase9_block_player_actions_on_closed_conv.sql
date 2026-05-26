-- ============================================================================
-- Fase 9 follow-up: bloquear acciones de jugador en convocatorias no-abiertas
-- ============================================================================
--
-- El jugador puede declinarse / volver SOLO mientras la convocatoria esta
-- abierta. Despues del cierre (fecha+hora+60min, status='cerrada' por cron),
-- los cambios son responsabilidad del admin via /convocatorias/[id].
--
-- Tambien aseguramos en bootstrap que la fecha calculada no sea anterior
-- al dia actual (defensivo: hoy _next_partido_at ya devuelve hoy o futuro).
--
-- Codigos:
--   P0057: convocatoria no esta abierta, accion de jugador rechazada.
--   P0058: fecha del partido seria anterior a hoy (no permitido).
-- ============================================================================

create or replace function public.player_decline_convocatoria(p_convocatoria_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id      uuid;
  v_cp_id          uuid;
  v_cp_status      public.attendance_status;
  v_cp_rol         public.membresia_tipo;
  v_cp_orden       int;
  v_conv_status    public.convocatoria_status;
  v_first_suplente uuid;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'not_a_player' using errcode = 'P0040';
  end if;

  select status into v_conv_status
    from public.convocatorias
   where id = p_convocatoria_id;
  if not found then
    raise exception 'convocatoria_not_found' using errcode = 'P0053';
  end if;
  if v_conv_status <> 'abierta' then
    raise exception 'convocatoria_not_open'
      using errcode = 'P0057', detail = v_conv_status::text;
  end if;

  select id, attendance_status, rol_en_convocatoria, orden_suplente
    into v_cp_id, v_cp_status, v_cp_rol, v_cp_orden
    from public.convocatoria_players
   where convocatoria_id = p_convocatoria_id
     and player_id = v_player_id
   for update;

  if not found then
    raise exception 'not_invited' using errcode = 'P0041';
  end if;

  if v_cp_status = 'declinado' then
    return;
  end if;

  update public.convocatoria_players
     set attendance_status = 'declinado',
         orden_suplente = null,
         updated_at = now()
   where id = v_cp_id;

  if v_cp_rol = 'titular' then
    select id into v_first_suplente
      from public.convocatoria_players
     where convocatoria_id = p_convocatoria_id
       and rol_en_convocatoria = 'suplente'
       and attendance_status <> 'declinado'
     order by orden_suplente asc
     limit 1
     for update;

    if found then
      update public.convocatoria_players
         set rol_en_convocatoria = 'titular',
             orden_suplente = null,
             updated_at = now()
       where id = v_first_suplente;
      perform public._conv_compactar_cola(p_convocatoria_id, 1);
    end if;
  elsif v_cp_rol = 'suplente' and v_cp_orden is not null then
    perform public._conv_compactar_cola(p_convocatoria_id, v_cp_orden);
  end if;
end;
$$;

comment on function public.player_decline_convocatoria(uuid) is
  'Fase 9 v3: el jugador se baja de UNA convocatoria. Marca declinado, libera su lugar y promueve suplente si era titular. Solo opera con convocatoria abierta (P0057 si no). No toca grupo_membresias.';

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
  v_cupo_titulares  int;
  v_titulares_count int;
  v_next_orden      int;
  v_tipo            public.membresia_tipo;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'not_a_player' using errcode = 'P0040';
  end if;

  select status, grupo_id into v_conv_status, v_conv_grupo_id
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

  select cupo_titulares into v_cupo_titulares
    from public.grupos
   where id = v_conv_grupo_id;

  select count(*) into v_titulares_count
    from public.convocatoria_players
   where convocatoria_id = p_convocatoria_id
     and rol_en_convocatoria = 'titular'
     and attendance_status <> 'declinado';

  if v_titulares_count < v_cupo_titulares then
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
  'Fase 9 v3: el jugador vuelve a la convocatoria. Solo opera con convocatoria abierta (P0057 si no). Si hay cupo de titular libre, entra como titular; sino al final de la cola de suplentes.';

-- Bootstrap: defensive check de fecha futura.
create or replace function public.bootstrap_convocatoria_for_grupo(p_grupo_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grupo         public.grupos%rowtype;
  v_partido_at    timestamptz;
  v_fecha         date;
  v_cierre_at     timestamptz;
  v_new_conv_id   uuid;
  v_existing_id   uuid;
begin
  select * into v_grupo from public.grupos where id = p_grupo_id;
  if not found then
    raise exception 'grupo_not_found' using errcode = 'P0050';
  end if;
  if v_grupo.status <> 'activo' then
    raise exception 'grupo_not_active' using errcode = 'P0051';
  end if;

  select id into v_existing_id
    from public.convocatorias
   where grupo_id = p_grupo_id
     and status = 'abierta'
   order by fecha desc
   limit 1;
  if found then
    raise exception 'open_convocatoria_already_exists'
      using errcode = 'P0052', detail = v_existing_id::text;
  end if;

  v_partido_at := public._next_partido_at(v_grupo.dia_semana, v_grupo.hora);
  v_fecha := v_partido_at::date;

  if v_fecha < current_date then
    raise exception 'fecha_anterior_a_hoy'
      using errcode = 'P0058', detail = v_fecha::text;
  end if;

  v_cierre_at := v_partido_at + (v_grupo.cierre_minutes_after_start || ' minutes')::interval;

  insert into public.convocatorias (fecha, status, modo, grupo_id, cierre_at, created_by)
  values (v_fecha, 'abierta', 'cerrada', p_grupo_id, v_cierre_at, v_grupo.owner_id)
  returning id into v_new_conv_id;

  insert into public.convocatoria_players (
    convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
  )
  select v_new_conv_id, gm.player_id, 'confirmado', 'titular', null
    from public.grupo_membresias gm
   where gm.grupo_id = p_grupo_id
     and gm.tipo = 'titular'
     and gm.status = 'activo'
   on conflict (convocatoria_id, player_id) do nothing;

  insert into public.convocatoria_players (
    convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
  )
  select v_new_conv_id, gm.player_id, 'confirmado', 'suplente', gm.orden
    from public.grupo_membresias gm
   where gm.grupo_id = p_grupo_id
     and gm.tipo = 'suplente'
     and gm.status = 'activo'
     and gm.orden is not null
   on conflict (convocatoria_id, player_id) do nothing;

  return v_new_conv_id;
end;
$$;

comment on function public.bootstrap_convocatoria_for_grupo(uuid) is
  'Fase 9 v3: crea la primera convocatoria del grupo. Inicializa con titulares + suplentes del grupo (FIFO). Rechaza con P0058 si la fecha calculada es anterior a hoy.';
