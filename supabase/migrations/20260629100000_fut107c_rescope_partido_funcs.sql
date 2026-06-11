-- ============================================================================
-- FUT-107c (Fase 11, Bloque 2, 2b — funciones del partido): rescopear el gate
-- admin del conteo de votos al coordinador del grupo.
-- ============================================================================
--
-- El desempate de figura/premios lo decide quien gestiona el grupo: ve el
-- conteo de votos por jugador y, si hay empate, fija el ganador. El WRITE del
-- override escribe columnas de `matches` (figura_player_id / carnicero_player_id
-- / pinocho_player_id) y ya quedó habilitado por la RLS de matches (FUT-107b,
-- matches_update_grupo). Lo único que falta es el READ del conteo, que hoy es
-- admin-only:
--   - get_figura_votes(match_id)              (FUT-99)
--   - get_award_votes(match_id, categoria)    (FUT-102)
--
-- Se cambia el gate `current_user_role() = 'admin'` por
-- `current_user_role() = 'admin' OR can_manage_match(match_id)`, de modo que el
-- coordinador vea el conteo SOLO de los partidos de su grupo. El jugador sigue
-- sin ver conteos (solo el resultado vía match_figura_resolved/match_award_resolved).
--
-- Son funciones de lectura; el resto de la firma/cuerpo queda igual.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- get_figura_votes: conteo de votos de la figura. admin (todos) o coordinador
--   del grupo del partido. Vacío para el resto.
-- ----------------------------------------------------------------------------
create or replace function public.get_figura_votes(p_match_id uuid)
returns table (voted_player_id uuid, nombre text, apodo text, votos bigint)
language sql
security definer
set search_path = ''
as $$
  select v.voted_player_id, p.nombre, p.apodo, count(*) as votos
    from public.match_figura_votes v
    join public.players p on p.id = v.voted_player_id
   where v.match_id = p_match_id
     and (
       public.current_user_role() = 'admin'
       or public.can_manage_match(p_match_id)
     )
   group by v.voted_player_id, p.nombre, p.apodo
   order by count(*) desc, coalesce(nullif(p.apodo, ''), p.nombre);
$$;

-- ----------------------------------------------------------------------------
-- get_award_votes: conteo de votos de un premio (carnicero/pinocho). admin
--   (todos) o coordinador del grupo del partido. Vacío para el resto.
-- ----------------------------------------------------------------------------
create or replace function public.get_award_votes(
  p_match_id uuid, p_categoria public.award_category
)
returns table (voted_player_id uuid, nombre text, apodo text, votos bigint)
language sql
security definer
set search_path = ''
as $$
  select v.voted_player_id, p.nombre, p.apodo, count(*) as votos
    from public.match_award_votes v
    join public.players p on p.id = v.voted_player_id
   where v.match_id = p_match_id and v.categoria = p_categoria
     and (
       public.current_user_role() = 'admin'
       or public.can_manage_match(p_match_id)
     )
   group by v.voted_player_id, p.nombre, p.apodo
   order by count(*) desc, coalesce(nullif(p.apodo, ''), p.nombre);
$$;
