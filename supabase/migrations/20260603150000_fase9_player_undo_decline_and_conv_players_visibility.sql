-- ============================================================================
-- Fase 9 follow-up: retract de decline + visibilidad de conv_players para
-- miembros del grupo
-- ============================================================================
--
-- Dos cambios:
--
-- 1) player_undo_decline_convocatoria(convocatoria_id): el jugador vuelve
--    a la convocatoria despues de haber declinado. Solo opera si su fila
--    actual es 'declinado'. Marca attendance_status='confirmado'. Idempotente.
--
-- 2) Nueva RLS policy convocatoria_players_select_player_member_of_grupo:
--    el jugador puede leer las filas de convocatoria_players de cualquier
--    convocatoria de un grupo donde tiene (o tuvo) membresia. Esto habilita
--    que /mi-perfil filtre los 'declinado' del lineup visible.
--
--    Se evita recursion entre RLS de convocatoria_players y RLS de
--    convocatorias via helper SECURITY DEFINER is_member_of_conv_grupo.
-- ============================================================================

create or replace function public.player_undo_decline_convocatoria(p_convocatoria_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id  uuid;
  v_cp_id      uuid;
  v_cp_status  public.attendance_status;
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

  if v_cp_status <> 'declinado' then
    return;
  end if;

  update public.convocatoria_players
     set attendance_status = 'confirmado',
         updated_at = now()
   where id = v_cp_id;
end;
$$;

comment on function public.player_undo_decline_convocatoria(uuid) is
  'Fase 9 follow-up: el jugador retracta su decline y vuelve a la convocatoria. Idempotente: si no esta declinado, no hace nada.';

revoke all on function public.player_undo_decline_convocatoria(uuid) from public;
grant execute on function public.player_undo_decline_convocatoria(uuid) to authenticated;

create or replace function public.is_member_of_conv_grupo(p_convocatoria_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
      from public.convocatorias c
      join public.grupo_membresias gm on gm.grupo_id = c.grupo_id
     where c.id = p_convocatoria_id
       and gm.player_id = public.current_player_id()
  )
$$;

comment on function public.is_member_of_conv_grupo(uuid) is
  'Fase 9 follow-up: helper SECURITY DEFINER para policies. true si el player actual tiene cualquier membresia (activa o inactiva) en el grupo de la convocatoria. Evita recursion entre policies de conv_players y convocatorias.';

revoke all on function public.is_member_of_conv_grupo(uuid) from public;
grant execute on function public.is_member_of_conv_grupo(uuid) to authenticated;

create policy convocatoria_players_select_player_member_of_grupo
  on public.convocatoria_players
  for select
  to authenticated
  using (
    public.current_user_role() = 'player'
    and public.is_member_of_conv_grupo(public.convocatoria_players.convocatoria_id)
  );

comment on policy convocatoria_players_select_player_member_of_grupo on public.convocatoria_players is
  'Fase 9 follow-up: el jugador ve las invitaciones de cualquier convocatoria de un grupo donde tiene (o tuvo) membresia. Necesario para que el lineup en /mi-perfil pueda excluir a los declinados.';
