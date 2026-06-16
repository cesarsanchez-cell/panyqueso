-- ============================================================================
-- Fix: players_public no resolvía nombres para el rol coordinador
-- ============================================================================
--
-- La vista players_public filtraba rows por rol:
--   - admin/veedor: todos.
--   - player: su propio row + compañeros de sus grupos activos.
--   - cualquier otro (incluido coordinador): NINGUNO.
--
-- El coordinador también juega (tiene ficha), así que en su /mi-perfil veía la
-- estructura del roster (números de posición) pero todos los nombres caían al
-- fallback "—": la vista no le devolvía ninguna fila.
--
-- Fix: la rama de "compañeros" ya no se gatea por `current_user_role() = 'player'`
-- sino por `current_player_id() is not null` — es decir, CUALQUIER cuenta con
-- ficha de jugador (player, coordinador, o un admin/veedor que además juegue).
-- Para el rol player el comportamiento es idéntico (current_player_id() = su id).
-- admin/veedor siguen viendo a todos por la primera rama.
--
-- Solo cambia el WHERE; las columnas expuestas son las mismas (sin ratings,
-- private_notes, phone ni email).
-- ============================================================================

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
  -- Admin y veedor ven a todos.
  public.current_user_role() in ('admin', 'veedor')
  -- Cualquier cuenta con ficha (player, coordinador, admin/veedor que juega)
  -- ve su propio row y a los miembros activos de sus grupos.
  or (
    public.current_player_id() is not null
    and (
      p.auth_user_id = auth.uid()
      or exists (
        select 1
          from public.grupo_membresias gm_self
          join public.grupo_membresias gm_other
            on gm_self.grupo_id = gm_other.grupo_id
         where gm_self.player_id = public.current_player_id()
           and gm_other.player_id = p.id
           and gm_self.status = 'activo'
           and gm_other.status = 'activo'
      )
    )
  );

comment on view public.players_public is
  'Fase 9 (+ fix coordinador): vista safe de players (sin ratings, private_notes, phone ni email). Admin/veedor ven a todos; cualquier cuenta con ficha (current_player_id() not null) ve su row + compañeros de grupos activos. security_invoker=false: el control vive en el WHERE.';
