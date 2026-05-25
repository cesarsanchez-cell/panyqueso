-- ============================================================================
-- Fase 9 fix: get_my_player_summary() para /mi-perfil
-- ============================================================================
--
-- Bug: la pagina /mi-perfil hacia SELECT directo sobre public.players para
-- obtener id, nombre, status y apodo del jugador logueado. Pero el rol
-- player no tiene SELECT policy en players (los datos publicos pasan por la
-- view players_public, que omite status e id por privacidad). Resultado:
-- query devolvia null silenciosamente -> "Hola" sin nombre, "Tu perfil esta
-- pendiente" aun para players approved, y ningun grupo cargado (porque la
-- query de membresias necesita player.id).
--
-- Fix: RPC SECURITY DEFINER que devuelve los campos minimos que /mi-perfil
-- necesita. Bypassa RLS de players y se autodescubre con auth.uid(). No
-- exponemos ratings ni private_notes - solo lo que el propio jugador puede
-- ver sobre si mismo.
-- ============================================================================

create or replace function public.get_my_player_summary()
returns table (
  id     uuid,
  nombre text,
  status public.player_status,
  apodo  text
)
language sql
security definer
set search_path = ''
stable
as $$
  select p.id, p.nombre, p.status, p.apodo
    from public.players p
   where p.auth_user_id = auth.uid()
   limit 1
$$;

comment on function public.get_my_player_summary() is
  'Fase 9: devuelve los datos safe del propio jugador (id/nombre/status/apodo) para /mi-perfil. SECURITY DEFINER porque el rol player no tiene SELECT directo en public.players.';

revoke all on function public.get_my_player_summary() from public;
grant execute on function public.get_my_player_summary() to authenticated;
