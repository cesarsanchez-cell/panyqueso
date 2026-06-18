-- ============================================================================
-- El coordinador puede re-agregar ex-miembros a su grupo
-- ============================================================================
--
-- Bug: cuando un jugador se baja del grupo (membresía → inactivo), el coordinador
-- no lo veía en el combo "Agregar miembro" y no podía traerlo de vuelta; el admin
-- sí. La causa es FUT-109 (20260705100000): player_in_managed_grupo() pasó a
-- contar SOLO membresías activas, así el coordinador deja de ver la FICHA de un
-- ex-miembro. Efecto colateral: el ex-miembro desaparece de su lista de
-- candidatos (que salía del padrón de players, gateado por esa misma policy).
--
-- Fix: una RPC dedicada para la lista de candidatos del combo, que NO toca la
-- privacidad de FUT-109 (sigue sin exponer la ficha: devuelve solo id/nombre/
-- apodo). El alcance depende del rol:
--   - admin: todo el padrón approved (igual que hoy).
--   - coordinador: jugadores que son o FUERON miembros (activo o inactivo) de
--     alguno de sus grupos → recupera ex-miembros, sin abrirle el padrón global
--     (consistente con FUT-108).
-- En ambos casos se excluye a los que ya están activos en el grupo destino.
--
-- can_manage_grupo es SECURITY DEFINER y solo consulta coordinador_grupos, así
-- que no hay recursión con las policies de grupo_membresias.
-- ============================================================================

create or replace function public.addable_players_for_grupo(p_grupo_id uuid)
returns table (id uuid, nombre text, apodo text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nombre, p.apodo
  from public.players p
  where p.status = 'approved'
    -- Gate: solo si el usuario gestiona el grupo destino (admin o su coordinador).
    and public.can_manage_grupo(p_grupo_id)
    -- Excluir a los que ya son miembros activos del grupo destino.
    and not exists (
      select 1
      from public.grupo_membresias gm
      where gm.grupo_id = p_grupo_id
        and gm.player_id = p.id
        and gm.status = 'activo'
    )
    and (
      -- Admin: todo el padrón approved.
      public.current_user_role() = 'admin'
      -- Coordinador: jugadores con cualquier membresía (activa o inactiva) en
      -- alguno de sus grupos. Incluye ex-miembros del grupo destino.
      or exists (
        select 1
        from public.grupo_membresias gm2
        where gm2.player_id = p.id
          and public.can_manage_grupo(gm2.grupo_id)
      )
    )
  order by p.nombre;
$$;

comment on function public.addable_players_for_grupo(uuid) is
  'Candidatos para el combo "Agregar miembro" del grupo. Solo id/nombre/apodo (no expone ficha). admin = padrón approved; coordinador = miembros (activos o inactivos) de sus grupos, recuperando ex-miembros. Excluye a los activos del grupo destino.';

revoke all on function public.addable_players_for_grupo(uuid) from public, anon;
grant execute on function public.addable_players_for_grupo(uuid) to authenticated;
