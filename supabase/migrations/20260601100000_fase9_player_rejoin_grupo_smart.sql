-- ============================================================================
-- Fase 9 fix: player_join_suplente_queue se vuelve smart (titular si hay cupo)
-- ============================================================================
--
-- Cambio de comportamiento solicitado por el usuario: cuando un jugador se
-- reincorpora al grupo desde /mi-perfil, no siempre debería ir a la cola de
-- suplentes. Si hay cupo libre de titulares, entra directo como titular.
-- Solo si no hay cupo, va a la cola FIFO de suplentes al final.
--
-- Misma logica que addMember del admin (PR #83): el rol del jugador y el del
-- admin se reconcilian.
--
-- La firma de la funcion cambia: ahora devuelve text con el tipo asignado
-- ('titular' o 'suplente') para que la UI pueda mostrar feedback claro.
-- ============================================================================

-- Drop la version vieja porque la nueva tiene returns distinto.
drop function if exists public.player_join_suplente_queue(uuid);

create or replace function public.player_join_suplente_queue(p_grupo_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id      uuid;
  v_grupo          public.grupos%rowtype;
  v_inactive_id    uuid;
  v_titulares_count int;
  v_tipo           public.membresia_tipo;
  v_next_orden     int;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'not_a_player' using errcode = 'P0040';
  end if;

  select * into v_grupo
    from public.grupos
   where id = p_grupo_id;

  if not found then
    raise exception 'grupo_not_found' using errcode = 'P0042';
  end if;

  if v_grupo.status <> 'activo' then
    raise exception 'grupo_not_active' using errcode = 'P0043';
  end if;

  -- Si ya esta activo en el grupo, no hacemos nada.
  if exists (
    select 1
      from public.grupo_membresias
     where grupo_id = p_grupo_id
       and player_id = v_player_id
       and status = 'activo'
  ) then
    raise exception 'already_active_in_grupo' using errcode = 'P0044';
  end if;

  -- Decidir tipo segun cupo libre.
  select count(*) into v_titulares_count
    from public.grupo_membresias
   where grupo_id = p_grupo_id
     and tipo = 'titular'
     and status = 'activo';

  if v_titulares_count < v_grupo.cupo_titulares then
    v_tipo := 'titular';
    v_next_orden := null;
  else
    v_tipo := 'suplente';
    select coalesce(max(orden), 0) + 1 into v_next_orden
      from public.grupo_membresias
     where grupo_id = p_grupo_id
       and tipo = 'suplente'
       and status = 'activo';
  end if;

  -- Buscar membresia inactiva previa para reactivar.
  select id into v_inactive_id
    from public.grupo_membresias
   where grupo_id = p_grupo_id
     and player_id = v_player_id
     and status = 'inactivo'
   order by inactivated_at desc nulls last
   limit 1
   for update;

  if found then
    update public.grupo_membresias
       set tipo           = v_tipo,
           orden          = v_next_orden,
           status         = 'activo',
           inactivated_at = null,
           inactivated_by = null
     where id = v_inactive_id;
  else
    insert into public.grupo_membresias (grupo_id, player_id, tipo, orden, status)
    values (p_grupo_id, v_player_id, v_tipo, v_next_orden, 'activo');
  end if;

  return v_tipo::text;
end;
$$;

comment on function public.player_join_suplente_queue(uuid) is
  'Fase 9 fix: jugador se reincorpora al grupo (un click). Smart FIFO: si hay cupo libre de titulares entra como titular, sino como suplente al final de la cola. Devuelve el tipo asignado para feedback en UI.';

revoke all on function public.player_join_suplente_queue(uuid) from public;
grant execute on function public.player_join_suplente_queue(uuid) to authenticated;
