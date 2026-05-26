-- ============================================================================
-- Fase 9 follow-up: el jugador sigue viendo el lineup despues de bajarse
-- ============================================================================
--
-- Bug detectado al probar el ciclo de convocatorias: cuando un titular se
-- baja con el boton "No voy", el RPC player_decline_convocatoria desactiva
-- su grupo_membresia (libera el lugar) y promueve al suplente #1. Eso es
-- correcto, pero el efecto colateral en /mi-perfil es que el grupo
-- desaparece por completo: las policies actuales solo dejan al player leer
-- la cola de grupos donde es miembro ACTIVO.
--
-- UX deseada (palabras del usuario): "deberia mostrarla aunque ya se haya
-- bajado". El jugador que estuvo en el grupo debe seguir viendo quien va,
-- y debe poder volver al grupo desde el mismo card.
--
-- Cambios en RLS:
--   1. Helper has_any_membership_in_grupo(uuid): SECURITY DEFINER, dice si
--      el player actual tiene cualquier membresia (activa o inactiva) en
--      el grupo.
--   2. Policy adicional grupo_membresias_select_player_was_member:
--      complementa la existente. Le permite al player leer las filas
--      ACTIVAS de grupos donde tuvo membresia, aun cuando hoy esta
--      inactivo en el grupo.
--   3. Recreate players_public view: relajamos el branch del player para
--      que vea a los miembros activos de cualquier grupo donde tuvo
--      (o tiene) membresia.
--
-- Privacidad: solo exponemos filas/rows ACTIVOS de terceros. La membresia
-- inactiva propia se sigue exponiendo via grupo_membresias_select_self_player.
-- No filtramos a ex-jugadores; un player que se fue del grupo no aparece
-- en la vista de nadie (gm_other.status = 'activo').
-- ============================================================================

create or replace function public.has_any_membership_in_grupo(p_grupo_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
      from public.grupo_membresias gm
     where gm.grupo_id = p_grupo_id
       and gm.player_id = public.current_player_id()
  )
$$;

comment on function public.has_any_membership_in_grupo(uuid) is
  'Fase 9 follow-up: devuelve true si el player actual tiene cualquier membresia (activa o inactiva) en el grupo. Usado por policies que exponen el lineup a ex-miembros.';

revoke all on function public.has_any_membership_in_grupo(uuid) from public;
grant execute on function public.has_any_membership_in_grupo(uuid) to authenticated;

create policy grupo_membresias_select_player_was_member
  on public.grupo_membresias
  for select
  to authenticated
  using (
    public.current_user_role() = 'player'
    and status = 'activo'
    and public.has_any_membership_in_grupo(public.grupo_membresias.grupo_id)
  );

comment on policy grupo_membresias_select_player_was_member on public.grupo_membresias is
  'Fase 9 follow-up: el jugador ve las filas activas de los grupos donde tuvo cualquier membresia, asi puede seguir viendo el lineup despues de bajarse.';

create or replace view public.players_public as
select
  p.id,
  p.nombre,
  p.fecha_nacimiento,
  p.role_field,
  p.position_pref,
  p.positions_possible,
  p.status,
  p.apodo,
  p.pierna_habil,
  p.avatar_url,
  p.ubicacion_maps_url
from public.players p
where
  public.current_user_role() in ('admin', 'veedor')
  or (
    public.current_user_role() = 'player'
    and (
      p.auth_user_id = auth.uid()
      or exists (
        select 1
          from public.grupo_membresias gm_self
          join public.grupo_membresias gm_other
            on gm_self.grupo_id = gm_other.grupo_id
         where gm_self.player_id = public.current_player_id()
           and gm_other.player_id = p.id
           and gm_other.status = 'activo'
      )
    )
  );

comment on view public.players_public is
  'Fase 9 follow-up: vista safe de players. Player ve a los miembros ACTIVOS de los grupos donde tiene o tuvo cualquier membresia (asi ve el lineup despues de bajarse). gm_self.status no se restringe; gm_other.status si (no exponemos ex-jugadores).';
