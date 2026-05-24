-- ============================================================================
-- Fase 9 PR 2: view players_public + RLS para el rol 'player'
-- ============================================================================
--
-- Problema: queremos que un jugador autenticado pueda ver los datos basicos
-- de sus companeros de grupo (nombre, foto, apodo, posicion, etc.) pero NO
-- los datos sensibles (ratings, internal_score, private_notes, phone, email).
--
-- Postgres no soporta column-level RLS de forma directa. Solucion: una view
-- `players_public` que:
--   1. Proyecta solo las columnas safe.
--   2. Filtra rows segun el rol del caller (admin/veedor ven todo; player
--      ve solo su propio row + companeros de grupos donde tiene membresia
--      activa).
--   3. Corre con security_invoker=false (default, owner=postgres) para
--      bypassar la RLS de `players`. El control de acceso esta dentro del
--      WHERE de la view.
--
-- El frontend del player apunta a `players_public`, nunca a la tabla
-- `players` directa (que no tiene policy de SELECT para 'player').
--
-- Para que la view pueda saber quien es el player actual, agregamos un
-- helper `current_player_id()` SECURITY DEFINER que mapea auth.uid() a
-- players.id via el linkeo de auth_user_id.
--
-- Tambien sumamos RLS policies para que el player vea sus grupos y la
-- cola FIFO de sus grupos (necesario para /mi-perfil y vistas conexas).
-- ============================================================================

-- 1. Helper: current_player_id() --------------------------------------------
-- Devuelve players.id si el caller esta logueado como player (tiene un row
-- en players con auth_user_id = auth.uid()). NULL si no.
--
-- SECURITY DEFINER porque la mayoria de las policies que la usan no podrian
-- leer players para resolverlo (especialmente desde policies sobre players).
create or replace function public.current_player_id()
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select id
    from public.players
   where auth_user_id = auth.uid()
   limit 1
$$;

comment on function public.current_player_id() is
  'Fase 9: mapea auth.uid() a players.id si el caller esta logueado como player. NULL si no.';

revoke all on function public.current_player_id() from public;
grant execute on function public.current_player_id() to authenticated;

-- 2. View players_public -----------------------------------------------------
-- Expone solo columnas safe. Filtra rows segun rol:
--   - admin/veedor: todos los players.
--   - player: su propio row + companeros con membresia activa compartida.
--   - anon: ninguno.
--
-- security_invoker=false (default) -> corre como owner, bypassa RLS de
-- players. Todo el control esta en el WHERE.
create view public.players_public as
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
  -- Player ve su propio row y a los miembros activos de sus grupos.
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
           and gm_self.status = 'activo'
           and gm_other.status = 'activo'
      )
    )
  );

comment on view public.players_public is
  'Fase 9: vista safe de players para el rol player (sin ratings, sin private_notes, sin phone, sin email). Admin/veedor pueden consultarla tambien pero usualmente van a la tabla directa. security_invoker=false: el control de acceso vive en el WHERE.';

grant select on public.players_public to authenticated;

-- 3. RLS para grupos: player ve los grupos donde tiene membresia activa -----
create policy grupos_select_player
  on public.grupos
  for select
  to authenticated
  using (
    public.current_user_role() = 'player'
    and exists (
      select 1 from public.grupo_membresias gm
       where gm.grupo_id = public.grupos.id
         and gm.player_id = public.current_player_id()
         and gm.status = 'activo'
    )
  );

-- 4. RLS para grupo_membresias: player ve la cola completa de sus grupos ---
create policy grupo_membresias_select_player
  on public.grupo_membresias
  for select
  to authenticated
  using (
    public.current_user_role() = 'player'
    and exists (
      select 1 from public.grupo_membresias gm_self
       where gm_self.grupo_id = public.grupo_membresias.grupo_id
         and gm_self.player_id = public.current_player_id()
         and gm_self.status = 'activo'
    )
  );

comment on policy grupo_membresias_select_player on public.grupo_membresias is
  'Fase 9: el jugador ve la cola completa de los grupos donde es miembro activo. Decisión de privacidad: dentro del grupo todos ven a todos.';
