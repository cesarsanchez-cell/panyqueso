-- ============================================================================
-- FUT-108 (Fase 11, 2c — lectura del coordinador): players + ratings + requests
-- ============================================================================
--
-- Para operar su grupo (correr convocatorias, generar equipos, editar el rating
-- por grupo), el coordinador necesita LEER:
--   - players: ficha completa de los jugadores que son miembros de sus grupos
--     (decisión del usuario: ve como el admin, incl. private_notes y rating base,
--     pero SOLO de sus grupos — no el padrón global).
--   - player_group_ratings: el rating por grupo de sus grupos.
--   - player_change_requests: las solicitudes de cambio de rating de sus grupos
--     (no las globales, grupo_id null = solo admin/veedor).
--
-- Se AGREGAN policies de coordinador (las de admin/veedor quedan intactas; RLS
-- las combina con OR). La escritura sigue como estaba: el coordinador NO edita
-- la ficha global (eso es admin); edita el rating por grupo vía
-- propose_group_rating_change (ya scoped a can_manage_grupo en FUT-107e).
--
-- ⚠️ Helper SECURITY DEFINER player_in_managed_grupo(): resuelve "el jugador es
-- miembro de algún grupo que gestiono" SALTANDO RLS de grupo_membresias, para no
-- ciclar con las policies player de esa tabla (mismo patrón anti-recursión que
-- can_manage_match).
-- ============================================================================

create or replace function public.player_in_managed_grupo(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.grupo_membresias gm
    where gm.player_id = p_player_id
      and public.can_manage_grupo(gm.grupo_id)
  );
$$;

comment on function public.player_in_managed_grupo(uuid) is
  'FUT-108: true si el jugador es miembro de algún grupo que el usuario gestiona (admin = cualquiera con membresía; coordinador = sus grupos). SECURITY DEFINER para evitar recursión con las policies de grupo_membresias.';

revoke all on function public.player_in_managed_grupo(uuid) from public;
grant execute on function public.player_in_managed_grupo(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- players: el coordinador ve la ficha completa de los miembros de sus grupos.
-- ----------------------------------------------------------------------------
drop policy if exists players_select_coordinador on public.players;
create policy players_select_coordinador
  on public.players
  for select
  to authenticated
  using (public.player_in_managed_grupo(id));

-- ----------------------------------------------------------------------------
-- player_group_ratings: el coordinador ve el rating de sus grupos.
-- ----------------------------------------------------------------------------
drop policy if exists player_group_ratings_select_coordinador on public.player_group_ratings;
create policy player_group_ratings_select_coordinador
  on public.player_group_ratings
  for select
  to authenticated
  using (public.can_manage_grupo(grupo_id));

-- ----------------------------------------------------------------------------
-- player_change_requests: el coordinador ve las solicitudes de SUS grupos
-- (las globales, grupo_id null, siguen siendo admin/veedor).
-- ----------------------------------------------------------------------------
drop policy if exists player_change_requests_select_coordinador on public.player_change_requests;
create policy player_change_requests_select_coordinador
  on public.player_change_requests
  for select
  to authenticated
  using (grupo_id is not null and public.can_manage_grupo(grupo_id));
