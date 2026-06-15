-- ============================================================================
-- Presentismo (Fase 12): cancelar una sesión ABIERTA sin confirmar
-- ============================================================================
--
-- Si el coordinador abrió la cancha por error o quiere cambiar la fecha, hasta
-- ahora tenía que borrar la convocatoria por SQL. Esta RPC lo hace desde la app:
-- elimina la sesión presentismo SOLO si está 'abierta' (sin confirmar, sin
-- partido), arrastra el check-in (convocatoria_players) y los probadores
-- (is_guest) que quedaban huérfanos. Devuelve a la pantalla "Abrir la cancha".
--
-- No toca sesiones ya confirmadas (status 'cerrada' → P0057): ésas tienen un
-- partido que cuenta para historial/premios y no se cancelan por acá.
--
-- Gate: can_manage_convocatoria (admin o coordinador del grupo).
-- Errores: P0013 no autorizado, P0053 no existe, P0080 no presentismo,
--          P0057 no está abierta, P0083 ya confirmada (defensivo).
-- ============================================================================

create or replace function public.cancelar_sesion_presentismo(p_convocatoria_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv      public.convocatorias%rowtype;
  v_guest_ids uuid[];
begin
  if not public.can_manage_convocatoria(p_convocatoria_id) then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;

  select * into v_conv from public.convocatorias where id = p_convocatoria_id for update;
  if not found then
    raise exception 'convocatoria_not_found' using errcode = 'P0053';
  end if;
  if v_conv.modo <> 'presentismo' then
    raise exception 'convocatoria_no_presentismo' using errcode = 'P0080';
  end if;
  if v_conv.status <> 'abierta' then
    raise exception 'convocatoria_not_open' using errcode = 'P0057', detail = v_conv.status::text;
  end if;
  -- Defensa: una sesión abierta no debería tener partido; si lo tiene, ya se
  -- confirmó y no se cancela por acá.
  if exists (select 1 from public.matches where convocatoria_id = p_convocatoria_id) then
    raise exception 'ya_confirmada' using errcode = 'P0083';
  end if;

  -- Probadores (is_guest) presentes en esta sesión, para borrarlos al final si
  -- ya no quedan referenciados en ningún otro lado.
  select array_agg(distinct cp.player_id)
    into v_guest_ids
    from public.convocatoria_players cp
    join public.players p on p.id = cp.player_id
   where cp.convocatoria_id = p_convocatoria_id
     and p.is_guest = true;

  delete from public.convocatoria_players where convocatoria_id = p_convocatoria_id;
  delete from public.convocatorias where id = p_convocatoria_id;

  if v_guest_ids is not null then
    delete from public.players p
     where p.id = any(v_guest_ids)
       and p.is_guest = true
       and not exists (
         select 1 from public.convocatoria_players cp where cp.player_id = p.id
       )
       and not exists (
         select 1 from public.match_team_players mtp where mtp.player_id = p.id
       );
  end if;
end;
$$;

comment on function public.cancelar_sesion_presentismo(uuid) is
  'Fase 12: cancela (elimina) una sesión presentismo ABIERTA sin confirmar — borra check-in y probadores huérfanos. No toca sesiones confirmadas (P0057). Gate can_manage_convocatoria.';

revoke all on function public.cancelar_sesion_presentismo(uuid) from public, anon;
grant execute on function public.cancelar_sesion_presentismo(uuid) to authenticated;
