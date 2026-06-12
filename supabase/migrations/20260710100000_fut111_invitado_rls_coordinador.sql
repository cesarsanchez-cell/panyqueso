-- ============================================================================
-- FUT-111: el coordinador puede LEER los invitados de las convocatorias que gestiona
-- ============================================================================
--
-- El invitado (players.is_guest) no es miembro de ningún grupo, así que la policy
-- players_select_coordinador (player_in_managed_grupo) NO lo deja ver. Sin esto,
-- al coordinador se le rompe todo lo que lee la fila del invitado bajo RLS:
--   - el generador de equipos lo EXCLUYE (no ve su internal_score),
--   - el nombre en anotados/equipos sale "—" (nombre_libre es NULL en el modelo
--     fantasma; el nombre vive en players.nombre),
--   - el confirmar y los premios no lo encuentran.
--
-- (El admin/veedor ya ven todos los players por players_select_admin_veedor.)
--
-- Damos una policy SELECT acotada: el coordinador ve un invitado si está en una
-- convocatoria que gestiona. Helper SECURITY DEFINER para resolver el vínculo
-- saltando RLS (evita recursión players ↔ convocatoria_players).
-- ============================================================================

create or replace function public.player_is_guest_in_managed_convocatoria(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players p
    join public.convocatoria_players cp on cp.player_id = p.id
    where p.id = p_player_id
      and p.is_guest = true
      and public.can_manage_convocatoria(cp.convocatoria_id)
  );
$$;

comment on function public.player_is_guest_in_managed_convocatoria(uuid) is
  'FUT-111: true si el player es un invitado (is_guest) en alguna convocatoria que el usuario gestiona. SECURITY DEFINER para evitar recursión players ↔ convocatoria_players bajo RLS.';

revoke all on function public.player_is_guest_in_managed_convocatoria(uuid) from public, anon;
grant execute on function public.player_is_guest_in_managed_convocatoria(uuid) to authenticated;

create policy players_select_guest_coordinador
  on public.players
  for select
  to authenticated
  using (public.player_is_guest_in_managed_convocatoria(id));
