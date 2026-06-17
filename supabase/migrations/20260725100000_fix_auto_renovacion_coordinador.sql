-- ============================================================================
-- Fix: la auto-renovación de convocatorias acepta al coordinador del grupo
-- ============================================================================
--
-- create_next_convocatoria (worker de auto-renovación, Fase 9 Bug 4) exigía
-- rol = admin. Pero desde la Fase 11 el coordinador del grupo también cierra
-- y confirma partidos (confirmMatch y close_and_create permiten admin +
-- coordinador). Como la auto-renovación en confirmMatch es best-effort, cuando
-- un coordinador cerraba el partido la función lanzaba 'forbidden', el error se
-- tragaba y la próxima convocatoria NO se creaba: partido jugado, con resultado,
-- sin la siguiente.
--
-- Fix: reemplazar el gate admin-only por can_manage_grupo(grupo_id) (admin en
-- todos los grupos, coordinador en los suyos), igual que el resto de lo
-- operativo desde FUT-106. coalesce(...,false) porque can_manage_grupo devuelve
-- null si el usuario no tiene rol (gotcha conocido). El chequeo se mueve después
-- de cargar la conv origen, ya que necesita su grupo_id.
--
-- close_and_create_next_convocatoria NO se toca: llama a create_next por nombre,
-- así que hereda este gate (y deja de fallar para el coordinador en el botón
-- manual "Cerrar y crear siguiente").
--
-- El cuerpo conserva la versión vigente (Fase 10,
-- 20260607110000_fase10_convocatoria_cupo_y_fecha): la fecha de la siguiente
-- snapea al día habitual del grupo (no un +7 ciego). Solo cambia el gate.
-- ============================================================================

create or replace function public.create_next_convocatoria(
  p_source_conv_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv          public.convocatorias%rowtype;
  v_grupo         public.grupos%rowtype;
  v_next_fecha    date;
  v_next_at       timestamptz;
  v_next_cierre   timestamptz;
  v_new_conv_id   uuid;
begin
  select * into v_conv from public.convocatorias where id = p_source_conv_id;
  if not found then
    return null;
  end if;
  if v_conv.grupo_id is null then
    return null;
  end if;

  -- Autoridad por grupo: admin (todos) o coordinador asignado a ESTE grupo.
  -- Antes era admin-only; con el cierre/confirmación en manos del coordinador
  -- (Fase 11) la auto-renovación fallaba en silencio.
  if not coalesce(public.can_manage_grupo(v_conv.grupo_id), false) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_grupo from public.grupos where id = v_conv.grupo_id;
  if not found then
    return null;
  end if;
  if v_grupo.status <> 'activo' or v_grupo.auto_renovar = false then
    return null;
  end if;

  -- Si ya hay una conv abierta posterior, no creamos otra.
  if exists (
    select 1 from public.convocatorias
     where grupo_id = v_conv.grupo_id
       and status = 'abierta'
       and fecha > v_conv.fecha
  ) then
    return null;
  end if;

  -- Fecha: proxima ocurrencia de dia_semana ESTRICTAMENTE posterior a la
  -- fecha origen. Si la origen ya cae en el dia del grupo -> +7. Si estaba
  -- corrida (fecha manual) -> vuelve al dia del grupo en vez de arrastrar el
  -- desfase. (Fase 10: 20260607110000_fase10_convocatoria_cupo_y_fecha.)
  v_next_fecha := v_conv.fecha
    + (((v_grupo.dia_semana - extract(dow from v_conv.fecha)::int + 7) % 7))::int;
  if v_next_fecha <= v_conv.fecha then
    v_next_fecha := v_next_fecha + 7;
  end if;

  v_next_at := (v_next_fecha + v_grupo.hora)::timestamptz;
  v_next_cierre := v_next_at + (v_grupo.cierre_minutes_after_start || ' minutes')::interval;

  insert into public.convocatorias (
    fecha, hora, lugar_id, cupo_maximo, status, modo, grupo_id, cierre_at, created_by
  )
  values (
    v_next_fecha,
    v_grupo.hora,
    v_grupo.lugar_id,
    v_grupo.cupo_titulares,
    'abierta',
    'cerrada',
    v_conv.grupo_id,
    v_next_cierre,
    v_grupo.owner_id
  )
  returning id into v_new_conv_id;

  -- Roster ESTRICTAMENTE desde la conv origen (no-declinados, player_id no
  -- nulo). No se re-valida contra grupo_membresias (Bug 2): el roster origen
  -- ya refleja las bajas via el trigger de sync. Invitados libres no se carrean.
  insert into public.convocatoria_players (
    convocatoria_id, player_id, attendance_status, rol_en_convocatoria, orden_suplente
  )
  select v_new_conv_id,
         cp.player_id,
         'confirmado',
         cp.rol_en_convocatoria,
         cp.orden_suplente
    from public.convocatoria_players cp
   where cp.convocatoria_id = p_source_conv_id
     and cp.attendance_status <> 'declinado'
     and cp.player_id is not null
   on conflict (convocatoria_id, player_id) do nothing;

  -- Llenar cupos de titulares vacios con los primeros suplentes activos.
  declare
    v_titulares_count int;
    v_cupo int := v_grupo.cupo_titulares;
    v_faltan int;
    v_supl_id uuid;
  begin
    select count(*) into v_titulares_count
      from public.convocatoria_players
     where convocatoria_id = v_new_conv_id
       and rol_en_convocatoria = 'titular'
       and attendance_status <> 'declinado';
    v_faltan := v_cupo - v_titulares_count;
    while v_faltan > 0 loop
      select id into v_supl_id
        from public.convocatoria_players
       where convocatoria_id = v_new_conv_id
         and rol_en_convocatoria = 'suplente'
         and attendance_status <> 'declinado'
       order by orden_suplente asc
       limit 1;
      exit when not found;
      update public.convocatoria_players
         set rol_en_convocatoria = 'titular',
             orden_suplente = null,
             updated_at = now()
       where id = v_supl_id;
      perform public._conv_compactar_cola(v_new_conv_id, 1);
      v_faltan := v_faltan - 1;
    end loop;
  end;

  return v_new_conv_id;
end;
$$;

comment on function public.create_next_convocatoria(uuid) is
  'Fase 9 Bug 4 + fix Fase 11: worker que arma la conv +7d a partir de una conv origen (cualquier status), heredando el roster no-declinado. Solo si el grupo esta activo+auto_renovar y no hay abierta posterior. Autoridad: can_manage_grupo (admin o coordinador del grupo). Usado por close_and_create_next_convocatoria y por confirmMatch.';

revoke all on function public.create_next_convocatoria(uuid) from public;
grant execute on function public.create_next_convocatoria(uuid) to authenticated;
