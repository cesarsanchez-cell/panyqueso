-- ============================================================================
-- Presentismo (Fase 12): fecha de "Abrir cancha" editable + validación en TZ AR
-- ============================================================================
--
-- "Abrir cancha" pasa a aceptar una fecha elegida por el coordinador (feriados /
-- partidos adelantados). El parámetro p_fecha ya existía; el único cambio acá es
-- que la validación "no permitir fechas pasadas" use el día de Argentina
-- (America/Argentina/Buenos_Aires) en vez de current_date (UTC), para no
-- rechazar por error una fecha válida cerca de medianoche (Argentina es UTC-3).
--
-- El resto de la función queda igual. El default (cuando p_fecha es NULL) sigue
-- usando _next_partido_at — pero la UI ahora siempre manda la fecha sugerida ya
-- calculada en TZ AR, así que el default es sólo un fallback.
-- ============================================================================

create or replace function public.abrir_cancha(
  p_grupo_id uuid,
  p_fecha    date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grupo       public.grupos%rowtype;
  v_partido_at  timestamptz;
  v_fecha       date;
  v_existing_id uuid;
  v_new_conv_id uuid;
begin
  if not public.can_manage_grupo(p_grupo_id) then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;

  select * into v_grupo from public.grupos where id = p_grupo_id;
  if not found then
    raise exception 'grupo_not_found' using errcode = 'P0050';
  end if;
  if v_grupo.status <> 'activo' then
    raise exception 'grupo_not_active' using errcode = 'P0051';
  end if;

  if p_fecha is null then
    v_partido_at := public._next_partido_at(v_grupo.dia_semana, v_grupo.hora);
    v_fecha := v_partido_at::date;
  else
    v_fecha := p_fecha;
  end if;

  -- "Hoy" según la zona horaria de Argentina (no UTC), para no rechazar una
  -- fecha válida cerca de medianoche.
  if v_fecha < (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'fecha_anterior_a_hoy' using errcode = 'P0058', detail = v_fecha::text;
  end if;

  -- Un grupo no puede tener dos convs no canceladas en la misma fecha.
  select id into v_existing_id
    from public.convocatorias
   where grupo_id = p_grupo_id
     and fecha = v_fecha
     and status <> 'cancelada'
   limit 1;
  if found then
    raise exception 'open_convocatoria_already_exists'
      using errcode = 'P0052', detail = v_existing_id::text;
  end if;

  -- cierre_at NULL a propósito: el cron de auto-renovación filtra por
  -- cierre_at IS NOT NULL, así que ignora las sesiones presentismo. Se cierran
  -- manualmente al confirmar la sesión (A4).
  insert into public.convocatorias (
    fecha, hora, lugar_id, cupo_maximo, status, modo, grupo_id, cierre_at, created_by
  )
  values (
    v_fecha, v_grupo.hora, v_grupo.lugar_id, v_grupo.cupo_titulares,
    'abierta', 'presentismo', p_grupo_id, null, coalesce(auth.uid(), v_grupo.owner_id)
  )
  returning id into v_new_conv_id;

  return v_new_conv_id;
end;
$$;

comment on function public.abrir_cancha(uuid, date) is
  'FUT-114 + fecha editable: abre una sesión presentismo en la fecha elegida (p_fecha, default próximo día del grupo). Valida fecha >= hoy (TZ Argentina). Gate can_manage_grupo.';

revoke all on function public.abrir_cancha(uuid, date) from public, anon;
grant execute on function public.abrir_cancha(uuid, date) to authenticated;
