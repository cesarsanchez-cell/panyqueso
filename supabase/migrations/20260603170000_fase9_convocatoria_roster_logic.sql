-- ============================================================================
-- Fase 9 follow-up: logica del roster de convocatoria (bootstrap, decline,
-- undo, sync con grupo)
-- ============================================================================
--
-- Modelo:
--   - Grupo = roster permanente. Cambia por acciones permanentes del admin
--     o del jugador (salir / volver al grupo).
--   - Convocatoria = partido especifico. Tiene su PROPIO roster en
--     convocatoria_players (rol_en_convocatoria + orden_suplente).
--   - Cuando una convocatoria se crea, se inicializa con el roster del grupo.
--   - Bajarse de una convocatoria libera el cupo de esa convocatoria, sin
--     tocar el grupo. Si era titular, el primer suplente de la convo sube.
--   - Volver a la convocatoria: si hay cupo de titular libre en la convo,
--     entra como titular; sino al final de la cola de suplentes de la convo.
--   - Cambios en el grupo (admin add/remove titular o suplente) se replican
--     en la convocatoria abierta si existe.
--
-- Codigos de error agregados:
--   P0056: cierre_minutes_after_start de la convocatoria, ya cubierto en
--          migracion anterior (P0055).
-- ============================================================================

-- ============================================================================
-- bootstrap_convocatoria_for_grupo (reescrito)
-- ============================================================================
-- Crea la primera convocatoria del grupo y la inicializa con su roster
-- COMPLETO (titulares + suplentes) preservando el orden FIFO del grupo.
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
  v_cierre_at := v_partido_at + (v_grupo.cierre_minutes_after_start || ' minutes')::interval;

  insert into public.convocatorias (fecha, status, modo, grupo_id, cierre_at, created_by)
  values (v_fecha, 'abierta', 'cerrada', p_grupo_id, v_cierre_at, v_grupo.owner_id)
  returning id into v_new_conv_id;

  -- Titulares del grupo -> titulares de la convocatoria, confirmados por defecto.
  insert into public.convocatoria_players (
    convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
  )
  select v_new_conv_id, gm.player_id, 'confirmado', 'titular', null
    from public.grupo_membresias gm
   where gm.grupo_id = p_grupo_id
     and gm.tipo = 'titular'
     and gm.status = 'activo'
   on conflict (convocatoria_id, player_id) do nothing;

  -- Suplentes del grupo -> suplentes de la convocatoria con su orden FIFO.
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
  'Fase 9 v2: crea la primera convocatoria de un grupo. La inicializa con titulares Y suplentes del grupo, preservando el orden FIFO. Los suplentes quedan invitados como "suplente de la convocatoria" listos para subir si un titular se baja.';

-- ============================================================================
-- Helper: compactar la cola de suplentes de UNA convocatoria desde un orden
-- dado (decrementa en 1 los suplentes activos con orden > fromOrden).
-- ============================================================================
create or replace function public._conv_compactar_cola(
  p_convocatoria_id uuid,
  p_from_orden int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.convocatoria_players
     set orden_suplente = orden_suplente - 1,
         updated_at = now()
   where convocatoria_id = p_convocatoria_id
     and rol_en_convocatoria = 'suplente'
     and attendance_status <> 'declinado'
     and orden_suplente > p_from_orden;
end;
$$;

comment on function public._conv_compactar_cola(uuid, int) is
  'Fase 9 v2 helper: corre la cola de suplentes activos (no declinados) de una convocatoria una posicion hacia arriba a partir de un orden dado.';

revoke all on function public._conv_compactar_cola(uuid, int) from public;

-- ============================================================================
-- player_decline_convocatoria (reescrito con el nuevo modelo)
-- ============================================================================
-- Aplica a titulares y suplentes. Marca declinado y mueve la cola si hace
-- falta: si era titular, el primer suplente activo sube a titular y se
-- compacta. Si era suplente, se compacta el resto de la cola.
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
  v_first_suplente uuid;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'not_a_player' using errcode = 'P0040';
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

  -- Idempotente.
  if v_cp_status = 'declinado' then
    return;
  end if;

  -- Marcar declinado y limpiar rol/orden (sale del roster activo).
  update public.convocatoria_players
     set attendance_status = 'declinado',
         orden_suplente = null,
         updated_at = now()
   where id = v_cp_id;

  if v_cp_rol = 'titular' then
    -- Buscar primer suplente activo de la convocatoria para que suba.
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
      -- Tras la subida, compactar la cola desde el orden=1 (ya no esta).
      perform public._conv_compactar_cola(p_convocatoria_id, 1);
    end if;
  elsif v_cp_rol = 'suplente' and v_cp_orden is not null then
    -- Era suplente: compactar desde el orden vacante.
    perform public._conv_compactar_cola(p_convocatoria_id, v_cp_orden);
  end if;
end;
$$;

comment on function public.player_decline_convocatoria(uuid) is
  'Fase 9 v2: el jugador se baja de UNA convocatoria. Marca declinado, libera su lugar y, si era titular, sube el primer suplente activo de la convocatoria. Compacta la cola. No toca grupo_membresias.';

-- ============================================================================
-- player_undo_decline_convocatoria (reescrito)
-- ============================================================================
-- Si hay cupo de titular libre en la convocatoria, vuelve como titular.
-- Sino al final de la cola de suplentes de la convocatoria.
-- Drop necesario porque cambia el tipo de retorno (void -> text).
drop function if exists public.player_undo_decline_convocatoria(uuid);

create or replace function public.player_undo_decline_convocatoria(p_convocatoria_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id      uuid;
  v_cp_id          uuid;
  v_cp_status      public.attendance_status;
  v_conv_grupo_id  uuid;
  v_cupo_titulares int;
  v_titulares_count int;
  v_next_orden     int;
  v_tipo           public.membresia_tipo;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'not_a_player' using errcode = 'P0040';
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

  -- Idempotente: si no esta declinado, retornamos el rol actual.
  if v_cp_status <> 'declinado' then
    return (
      select rol_en_convocatoria::text
        from public.convocatoria_players
       where id = v_cp_id
    );
  end if;

  -- Resolver cupo de titulares del grupo asociado a la conv.
  select c.grupo_id into v_conv_grupo_id
    from public.convocatorias c
   where c.id = p_convocatoria_id;

  if v_conv_grupo_id is null then
    -- Conv sin grupo (caso edge): permitimos volver como titular sin cupo.
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
  'Fase 9 v2: el jugador vuelve a la convocatoria. Si hay cupo de titular libre, entra como titular; sino al final de la cola de suplentes. Devuelve el rol asignado.';

revoke all on function public.player_undo_decline_convocatoria(uuid) from public;
grant execute on function public.player_undo_decline_convocatoria(uuid) to authenticated;

-- ============================================================================
-- close_and_create_next_convocatoria (reescrito)
-- ============================================================================
-- La proxima convocatoria se arma desde el roster ACTUAL DEL GRUPO (no del
-- partido anterior). Quien se bajo del partido pasado vuelve a quedar
-- invitado como titular o suplente segun su membresia.
create or replace function public.close_and_create_next_convocatoria(
  p_convocatoria_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv          public.convocatorias%rowtype;
  v_grupo         public.grupos%rowtype;
  v_partido_at    timestamptz;
  v_cierre_at     timestamptz;
  v_next_fecha    date;
  v_next_at       timestamptz;
  v_next_cierre   timestamptz;
  v_new_conv_id   uuid;
begin
  select * into v_conv from public.convocatorias where id = p_convocatoria_id for update;
  if not found then
    raise exception 'convocatoria_not_found' using errcode = 'P0053';
  end if;

  if v_conv.status <> 'abierta' then
    return null;
  end if;

  if v_conv.grupo_id is not null then
    select * into v_grupo from public.grupos where id = v_conv.grupo_id;
  end if;

  v_cierre_at := v_conv.cierre_at;
  if v_cierre_at is null then
    if v_conv.grupo_id is not null and v_grupo.id is not null then
      v_partido_at := (v_conv.fecha + v_grupo.hora)::timestamptz;
      v_cierre_at := v_partido_at + (v_grupo.cierre_minutes_after_start || ' minutes')::interval;
    else
      v_cierre_at := (v_conv.fecha + 1)::timestamptz;
    end if;
  end if;

  if now() < v_cierre_at then
    raise exception 'partido_not_yet_finished'
      using errcode = 'P0055', detail = v_cierre_at::text;
  end if;

  if v_conv.grupo_id is null then
    update public.convocatorias set status = 'cerrada' where id = p_convocatoria_id;
    return null;
  end if;
  if v_grupo.id is null then
    update public.convocatorias set status = 'cerrada' where id = p_convocatoria_id;
    return null;
  end if;

  update public.convocatorias set status = 'cerrada' where id = p_convocatoria_id;

  if v_grupo.status <> 'activo' or v_grupo.auto_renovar = false then
    return null;
  end if;

  if exists (
    select 1 from public.convocatorias
     where grupo_id = v_conv.grupo_id
       and status = 'abierta'
       and fecha > v_conv.fecha
  ) then
    return null;
  end if;

  v_next_fecha := v_conv.fecha + 7;
  v_next_at := (v_next_fecha + v_grupo.hora)::timestamptz;
  v_next_cierre := v_next_at + (v_grupo.cierre_minutes_after_start || ' minutes')::interval;

  insert into public.convocatorias (fecha, status, modo, grupo_id, cierre_at, created_by)
  values (v_next_fecha, 'abierta', 'cerrada', v_conv.grupo_id, v_next_cierre, v_grupo.owner_id)
  returning id into v_new_conv_id;

  -- Titulares del grupo -> titulares de la nueva conv.
  insert into public.convocatoria_players (
    convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
  )
  select v_new_conv_id, gm.player_id, 'confirmado', 'titular', null
    from public.grupo_membresias gm
   where gm.grupo_id = v_conv.grupo_id
     and gm.tipo = 'titular'
     and gm.status = 'activo'
   on conflict (convocatoria_id, player_id) do nothing;

  -- Suplentes del grupo -> suplentes de la nueva conv con su orden FIFO.
  insert into public.convocatoria_players (
    convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
  )
  select v_new_conv_id, gm.player_id, 'confirmado', 'suplente', gm.orden
    from public.grupo_membresias gm
   where gm.grupo_id = v_conv.grupo_id
     and gm.tipo = 'suplente'
     and gm.status = 'activo'
     and gm.orden is not null
   on conflict (convocatoria_id, player_id) do nothing;

  return v_new_conv_id;
end;
$$;

comment on function public.close_and_create_next_convocatoria(uuid) is
  'Fase 9 v2: cierra y arma la siguiente convocatoria (+7d) desde el roster ACTUAL del grupo. Guarda P0055 si todavia no se cumplio fecha+hora+cierre_minutes.';

-- ============================================================================
-- Trigger sync_open_conv_with_grupo (reescrito)
-- ============================================================================
-- Reemplaza al trigger anterior que solo manejaba titulares. Ahora maneja
-- titulares Y suplentes del grupo, sincronizandolos con la convocatoria
-- abierta:
--
--   - Si en el grupo aparece un titular activo nuevo (o promocionado) y hay
--     cupo libre de titular en la conv -> insertar/promover como titular en
--     la conv. Si no hay cupo -> como suplente al final de la cola de la conv.
--   - Si en el grupo aparece un suplente activo nuevo -> insertar como
--     suplente al final de la cola de la conv.
--   - Si en el grupo deja de ser activo (DELETE o status inactivo) -> sacar
--     de la conv (si era titular, sube primer suplente de la conv y compacta;
--     si era suplente, compacta).
-- ============================================================================
drop trigger if exists trg_sync_open_conv_with_titulares on public.grupo_membresias;
drop function if exists public.sync_open_conv_after_membership_change();

create or replace function public.sync_open_conv_after_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open_conv_id   uuid;
  v_grupo_id       uuid;
  v_cupo_titulares int;
  v_titulares_count int;
  v_was_member     boolean := false;
  v_was_tipo       public.membresia_tipo;
  v_is_member      boolean := false;
  v_is_tipo        public.membresia_tipo;
  v_existing_id    uuid;
  v_existing_rol   public.membresia_tipo;
  v_existing_orden int;
  v_first_supl_id  uuid;
  v_next_orden     int;
begin
  if tg_op = 'DELETE' then
    v_grupo_id := old.grupo_id;
  else
    v_grupo_id := new.grupo_id;
  end if;

  -- Buscar la conv abierta del grupo (si no hay, no hacemos nada).
  select id into v_open_conv_id
    from public.convocatorias
   where grupo_id = v_grupo_id
     and status = 'abierta'
   order by fecha desc
   limit 1;

  if v_open_conv_id is null then
    return coalesce(new, old);
  end if;

  -- Resolver cupo del grupo.
  select cupo_titulares into v_cupo_titulares
    from public.grupos
   where id = v_grupo_id;

  -- Estado previo y nuevo del row respecto del grupo.
  if tg_op in ('UPDATE', 'DELETE') then
    v_was_member := (old.status = 'activo');
    v_was_tipo   := old.tipo;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_is_member := (new.status = 'activo');
    v_is_tipo   := new.tipo;
  end if;

  -- Caso 1: el row deja de ser miembro activo (BAJA o DELETE). Sacarlo de
  -- la conv abierta. Si era titular, subir primer suplente y compactar; si
  -- era suplente activo, compactar la cola.
  if v_was_member and not v_is_member then
    select id, rol_en_convocatoria, orden_suplente
      into v_existing_id, v_existing_rol, v_existing_orden
      from public.convocatoria_players
     where convocatoria_id = v_open_conv_id
       and player_id = old.player_id
       and attendance_status <> 'declinado';

    if found then
      delete from public.convocatoria_players where id = v_existing_id;

      if v_existing_rol = 'titular' then
        select id into v_first_supl_id
          from public.convocatoria_players
         where convocatoria_id = v_open_conv_id
           and rol_en_convocatoria = 'suplente'
           and attendance_status <> 'declinado'
         order by orden_suplente asc
         limit 1;
        if found then
          update public.convocatoria_players
             set rol_en_convocatoria = 'titular',
                 orden_suplente = null,
                 updated_at = now()
           where id = v_first_supl_id;
          perform public._conv_compactar_cola(v_open_conv_id, 1);
        end if;
      elsif v_existing_rol = 'suplente' and v_existing_orden is not null then
        perform public._conv_compactar_cola(v_open_conv_id, v_existing_orden);
      end if;
    end if;

    return coalesce(new, old);
  end if;

  -- Caso 2: el row pasa a ser miembro activo (ALTA, REACTIVATION o cambio).
  -- Si ya tiene una fila no-declinada en la conv, ajustar rol si difiere.
  -- Si no, insertarlo: titular si hay cupo, sino suplente al final.
  if v_is_member then
    select id, rol_en_convocatoria, orden_suplente
      into v_existing_id, v_existing_rol, v_existing_orden
      from public.convocatoria_players
     where convocatoria_id = v_open_conv_id
       and player_id = new.player_id
       and attendance_status <> 'declinado';

    if not found then
      -- No estaba en la conv. Decidir rol segun cupo.
      select count(*) into v_titulares_count
        from public.convocatoria_players
       where convocatoria_id = v_open_conv_id
         and rol_en_convocatoria = 'titular'
         and attendance_status <> 'declinado';

      if v_is_tipo = 'titular' and v_titulares_count < v_cupo_titulares then
        -- Alta directa como titular de la conv.
        insert into public.convocatoria_players (
          convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
        )
        values (v_open_conv_id, new.player_id, 'confirmado', 'titular', null)
        on conflict (convocatoria_id, player_id) do update
          set attendance_status = 'confirmado',
              rol_en_convocatoria = 'titular',
              orden_suplente = null,
              updated_at = now();
      else
        -- Suplente al final de la cola (sea porque su rol en el grupo es
        -- suplente o porque el cupo de titulares de la conv ya esta lleno).
        select coalesce(max(orden_suplente), 0) + 1 into v_next_orden
          from public.convocatoria_players
         where convocatoria_id = v_open_conv_id
           and rol_en_convocatoria = 'suplente'
           and attendance_status <> 'declinado';

        insert into public.convocatoria_players (
          convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
        )
        values (v_open_conv_id, new.player_id, 'confirmado', 'suplente', v_next_orden)
        on conflict (convocatoria_id, player_id) do update
          set attendance_status = 'confirmado',
              rol_en_convocatoria = 'suplente',
              orden_suplente = v_next_orden,
              updated_at = now();
      end if;
    end if;
    -- Si ya existia una fila no-declinada en la conv para este player no la
    -- tocamos: las decisiones de la convocatoria mandan (su rol/orden en la
    -- conv no se sobreescribe por cambios cosmeticos en el grupo).
  end if;

  return coalesce(new, old);
end;
$$;

comment on function public.sync_open_conv_after_membership_change() is
  'Fase 9 v2: sincroniza la convocatoria abierta de un grupo con cambios en grupo_membresias. ALTA al grupo: entra a la conv como titular si hay cupo, sino suplente FIFO. BAJA del grupo: sale de la conv y sube primer suplente de la conv si liberaba un puesto titular.';

create trigger trg_sync_open_conv_with_grupo
  after insert or update or delete
  on public.grupo_membresias
  for each row
  execute function public.sync_open_conv_after_membership_change();
