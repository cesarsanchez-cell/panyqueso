-- ============================================================================
-- El jugador puede bajarse del grupo por su cuenta
-- ============================================================================
--
-- Hasta ahora solo el coord/admin podía dar de baja una membresía (UPDATE
-- directo con RLS). El jugador no tenía cómo bajarse del grupo.
--
-- player_leave_grupo: setea SU PROPIA membresía a 'inactivo'. El trigger
-- trg_sync_open_conv_with_grupo se encarga de sacarlo de la convocatoria
-- abierta y promover al primer suplente si liberaba un titular.
--
-- Volver a entrar lo decide el coord/admin (no hay auto-reenganche): ver
-- 20260731100000_no_autoreenganche_grupo.
-- ============================================================================

create or replace function public.player_leave_grupo(p_grupo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id    uuid;
  v_membresia_id uuid;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'no_player_ficha' using errcode = 'P0001';
  end if;

  select id into v_membresia_id
    from public.grupo_membresias
   where grupo_id = p_grupo_id
     and player_id = v_player_id
     and status = 'activo'
   for update;

  if v_membresia_id is null then
    raise exception 'not_active_member' using errcode = 'P0002';
  end if;

  update public.grupo_membresias
     set status = 'inactivo',
         inactivated_at = now()
   where id = v_membresia_id;
end;
$$;

comment on function public.player_leave_grupo(uuid) is
  'El jugador se baja de SU grupo (membresía → inactivo). El trigger de sync lo saca de la convocatoria abierta y promueve suplente. Reentrar lo decide el coord/admin.';

revoke all on function public.player_leave_grupo(uuid) from public, anon;
grant execute on function public.player_leave_grupo(uuid) to authenticated;
