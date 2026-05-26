-- ============================================================================
-- Fase 9 follow-up: admin_remove_from_convocatoria
-- ============================================================================
--
-- El admin puede sacar a un jugador (o invitado nombre_libre) del roster de
-- una convocatoria. Antes esto era un DELETE directo desde el server action,
-- pero dejaba el cupo de titulares con huecos: si el quitado era titular,
-- nadie subia de la cola de suplentes y los proximos altas/invitados
-- entraban directo a titular aprovechando el hueco fantasma.
--
-- Esta RPC encapsula la misma logica que player_decline_convocatoria pero
-- con DELETE definitivo en vez de marcar declinado:
--   1) DELETE del row.
--   2) Si era titular: primer suplente activo sube + compactar cola desde 1.
--   3) Si era suplente con orden: compactar cola desde el orden vacante.
--
-- El control de status de la convocatoria (no cancelada) sigue en el server
-- action TypeScript. Esta RPC asume que el caller es admin (el server action
-- ya lo valida via requireRole).
-- ============================================================================

create or replace function public.admin_remove_from_convocatoria(
  p_convocatoria_player_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cp_convocatoria uuid;
  v_cp_rol          public.membresia_tipo;
  v_cp_orden        int;
  v_cp_status       public.attendance_status;
  v_first_suplente  uuid;
begin
  select convocatoria_id, rol_en_convocatoria, orden_suplente, attendance_status
    into v_cp_convocatoria, v_cp_rol, v_cp_orden, v_cp_status
    from public.convocatoria_players
   where id = p_convocatoria_player_id
   for update;

  if not found then
    raise exception 'convocatoria_player_not_found' using errcode = 'P0070';
  end if;

  delete from public.convocatoria_players where id = p_convocatoria_player_id;

  -- Si el row eliminado estaba declinado no ocupaba lugar; nada que rebalancear.
  if v_cp_status = 'declinado' then
    return;
  end if;

  if v_cp_rol = 'titular' then
    select id into v_first_suplente
      from public.convocatoria_players
     where convocatoria_id = v_cp_convocatoria
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
      perform public._conv_compactar_cola(v_cp_convocatoria, 1);
    end if;
  elsif v_cp_rol = 'suplente' and v_cp_orden is not null then
    perform public._conv_compactar_cola(v_cp_convocatoria, v_cp_orden);
  end if;
end;
$$;

comment on function public.admin_remove_from_convocatoria(uuid) is
  'Fase 9 follow-up: el admin saca a un jugador (o invitado nombre_libre) del roster de la convocatoria. Si era titular, sube el primer suplente activo y compacta la cola. Si era suplente, compacta la cola desde el orden vacante. El control de status (no cancelada) se hace en el server action que la invoca.';

revoke all on function public.admin_remove_from_convocatoria(uuid) from public;
grant execute on function public.admin_remove_from_convocatoria(uuid) to authenticated;
