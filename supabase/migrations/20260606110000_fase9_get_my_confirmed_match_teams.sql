-- ============================================================================
-- Fase 9 fix (Bug 7): equipos confirmados visibles para el jugador en /mi-perfil
-- ============================================================================
--
-- El jugador necesita ver con quién va a jugar el próximo partido (los equipos
-- ya conformados), pero matches / match_teams / match_team_players son SELECT
-- admin+veedor por RLS, y el balance_snapshot incluye internal_score (que NO
-- se expone al jugador, ver CLAUDE.md privacidad).
--
-- get_my_confirmed_match_teams() devuelve SOLO datos neutrales (label, nombre,
-- apodo, si es arquero) del próximo match confirmado de cada grupo donde el
-- jugador es miembro activo. Sin scores, sin posiciones internas.
-- ============================================================================
create or replace function public.get_my_confirmed_match_teams()
returns table (
  grupo_id      uuid,
  fecha         date,
  team_label    text,
  player_id     uuid,
  nombre        text,
  apodo         text,
  is_goalkeeper boolean
)
language sql
security definer
set search_path = ''
as $$
  with mis_grupos as (
    select gm.grupo_id
      from public.grupo_membresias gm
     where gm.player_id = public.current_player_id()
       and gm.status = 'activo'
  ),
  -- Próximo match confirmado por grupo: el de menor fecha >= hoy.
  proximo as (
    select distinct on (c.grupo_id)
           c.grupo_id,
           m.id as match_id,
           m.fecha
      from public.matches m
      join public.convocatorias c on c.id = m.convocatoria_id
     where c.grupo_id in (select grupo_id from mis_grupos)
       and m.fecha >= current_date
     order by c.grupo_id, m.fecha asc
  )
  select px.grupo_id,
         px.fecha,
         mt.team_label::text,
         mtp.player_id,
         p.nombre,
         p.apodo,
         mtp.is_goalkeeper
    from proximo px
    join public.match_teams mt on mt.match_id = px.match_id
    join public.match_team_players mtp on mtp.match_team_id = mt.id
    join public.players p on p.id = mtp.player_id
   order by px.grupo_id, mt.team_label, mtp.is_goalkeeper desc, p.nombre;
$$;

comment on function public.get_my_confirmed_match_teams() is
  'Fase 9 Bug 7: equipos del próximo match confirmado (fecha >= hoy) de cada grupo del jugador. Solo datos neutrales (label, nombre, apodo, is_goalkeeper); sin scores ni datos internos. SECURITY DEFINER porque matches/* son admin+veedor por RLS.';

revoke all on function public.get_my_confirmed_match_teams() from public;
grant execute on function public.get_my_confirmed_match_teams() to authenticated;
