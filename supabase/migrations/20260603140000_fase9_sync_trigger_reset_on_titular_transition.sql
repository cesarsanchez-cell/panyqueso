-- ============================================================================
-- Fase 9 follow-up: el trigger debe RESETEAR a 'confirmado' cuando hay
-- transicion real hacia titular activo (no solo insertar si falta)
-- ============================================================================
--
-- Bug: el trigger anterior usaba ON CONFLICT DO NOTHING en todos los casos.
-- Eso preserva el estado existente, lo cual es correcto cuando la fila ya
-- era titular activa (no queremos pisar un 'declinado' legitimo de esta
-- semana). Pero es incorrecto cuando hay una transicion real desde
-- "no era titular activo" a "ahora si es titular activo". En esos casos el
-- estado vigente debe ser 'confirmado': el jugador acaba de ser dado de
-- alta o promovido y por defecto cuenta como que va.
--
-- Caso reportado: titular declino (con el RPC viejo que tambien inactivaba
-- la membresia) -> fila conv_players quedo 'declinado'. Despues "Volver al
-- grupo" lo dejo como suplente activo. Despues el admin saco otro titular,
-- esa promocion suplente->titular activo es una transicion real, pero el
-- trigger con DO NOTHING preservo el 'declinado' viejo. /mi-perfil filtra
-- declinado -> el boton "No voy" no aparece.
--
-- Cambio: distinguir transicion vs continuidad.
--   - was_titular = false, is_titular = true (transicion entrante): INSERT
--     ... ON CONFLICT DO UPDATE SET attendance_status = 'confirmado'.
--   - was_titular = true, is_titular = true (continuidad, ej: cambio de
--     orden): INSERT ... ON CONFLICT DO NOTHING (preservar estado).
--   - was_titular = true, is_titular = false: DELETE.
--
-- One-off backfill: reseteamos 'declinado' a 'confirmado' para todo
-- titular activo actual en una conv abierta. Justificacion: hasta hoy el
-- RPC de decline inactivaba la membresia, por lo que cualquier titular
-- activo + declinado vigente es estado inconsistente arrastrado. A partir
-- de las migraciones de hoy el decline preserva la membresia, asi que el
-- estado titular_activo + declinado pasa a ser legitimo ("estoy en el
-- grupo pero no voy esta semana") y nada lo va a tocar fuera de cambios
-- explicitos de membresia.
-- ============================================================================

create or replace function public.sync_open_conv_after_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open_conv_id uuid;
  v_grupo_id     uuid;
  v_was_titular  boolean := false;
  v_is_titular   boolean := false;
begin
  if tg_op = 'DELETE' then
    v_grupo_id := old.grupo_id;
  else
    v_grupo_id := new.grupo_id;
  end if;

  select id into v_open_conv_id
    from public.convocatorias
   where grupo_id = v_grupo_id
     and status = 'abierta'
   order by fecha desc
   limit 1;

  if v_open_conv_id is null then
    return coalesce(new, old);
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_was_titular := (old.status = 'activo' and old.tipo = 'titular');
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_is_titular := (new.status = 'activo' and new.tipo = 'titular');
  end if;

  -- Transicion entrante: alta nueva o promocion de no-titular-activo a
  -- titular activo. Resetear el estado de attendance a 'confirmado'.
  if v_is_titular and not v_was_titular then
    insert into public.convocatoria_players (
      convocatoria_id, player_id, attendance_status
    )
    values (v_open_conv_id, new.player_id, 'confirmado')
    on conflict (convocatoria_id, player_id) do update
      set attendance_status = 'confirmado',
          updated_at = now();
  end if;

  -- Continuidad: ya era titular activo y sigue siendolo (cambio de orden,
  -- timestamps, etc.). Asegurar que existe la fila pero NO pisar un
  -- estado de attendance legitimo (ej. el jugador declino esta semana).
  if v_is_titular and v_was_titular then
    insert into public.convocatoria_players (
      convocatoria_id, player_id, attendance_status
    )
    values (v_open_conv_id, new.player_id, 'confirmado')
    on conflict (convocatoria_id, player_id) do nothing;
  end if;

  -- Transicion saliente: dejo de ser titular activo o cambio de player_id.
  if v_was_titular and not v_is_titular then
    delete from public.convocatoria_players
     where convocatoria_id = v_open_conv_id
       and player_id = old.player_id;
  elsif v_was_titular and v_is_titular and old.player_id <> new.player_id then
    delete from public.convocatoria_players
     where convocatoria_id = v_open_conv_id
       and player_id = old.player_id;
  end if;

  return coalesce(new, old);
end;
$$;

comment on function public.sync_open_conv_after_membership_change() is
  'Fase 9 follow-up v2: trigger sobre grupo_membresias. Resetea attendance a confirmado en transiciones entrantes hacia titular activo; preserva estado en continuidad (titular activo que sigue siendolo); borra en transiciones salientes.';

-- One-off cleanup: titulares activos actualmente declinado en conv abierta
-- quedaron en ese estado por el RPC viejo de decline. Resetear a confirmado.
update public.convocatoria_players cp
   set attendance_status = 'confirmado',
       updated_at = now()
  from public.convocatorias c,
       public.grupo_membresias gm
 where cp.convocatoria_id = c.id
   and c.status = 'abierta'
   and gm.grupo_id = c.grupo_id
   and gm.player_id = cp.player_id
   and gm.tipo = 'titular'
   and gm.status = 'activo'
   and cp.attendance_status = 'declinado';
