-- ============================================================================
-- FUT-116: las fechas del grupo las ve TODO el grupo (no solo quien jugó)
-- ============================================================================
--
-- Visión: una vez jugada la fecha, cualquier miembro activo del grupo (haya
-- jugado o no) puede ver el resultado, la figura y los premios de esa fecha, y
-- el detalle (quién jugó + goles/asistencias/autogoles). Mismo espíritu que el
-- Prode (que ya lo ve todo el grupo). Solo datos neutros/positivos: nunca
-- ratings internos (CLAUDE.md). El Pinocho solo si el grupo lo habilitó.
--
-- Dos funciones SECURITY DEFINER gateadas por is_active_member_of_grupo (o
-- can_manage para admin/coordinador), mismo patrón que get_prode_*:
--   - get_grupo_fechas(grupo): una fila por partido YA JUGADO del grupo
--     (winner cargado o fecha pasada), con resultado + figura + carnicero +
--     pinocho. No depende de que el que mira haya jugado.
--   - get_grupo_fecha_stats(match): el detalle de esa fecha (jugadores por
--     equipo + goles/asistencias/autogoles).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- get_grupo_fechas: las fechas jugadas del grupo (resumen por fecha).
-- ----------------------------------------------------------------------------
create or replace function public.get_grupo_fechas(p_grupo_id uuid)
returns table (
  match_id           uuid,
  fecha              date,
  score_a            int,
  score_b            int,
  winner             text,
  figura_nombre      text,
  carnicero_nombre   text,
  pinocho_habilitado boolean,
  pinocho_nombre     text,
  video_resumen_url  text
)
language sql
security definer
set search_path = ''
as $$
  select
    m.id,
    m.fecha,
    m.score_team_a,
    m.score_team_b,
    m.winner::text,
    coalesce(nullif(fpl.apodo, ''), fpl.nombre)                          as figura_nombre,
    coalesce(nullif(cpl.apodo, ''), cpl.nombre)                          as carnicero_nombre,
    coalesce(g.premio_pinocho, false)                                    as pinocho_habilitado,
    case when coalesce(g.premio_pinocho, false)
         then coalesce(nullif(ppl.apodo, ''), ppl.nombre) end            as pinocho_nombre,
    m.video_resumen_url
  from public.matches m
  join public.convocatorias c on c.id = m.convocatoria_id
  join public.grupos g on g.id = c.grupo_id
  left join lateral (select public.match_figura_resolved(m.id) as id) rf on true
  left join public.players fpl on fpl.id = rf.id
  left join lateral (select public.match_award_resolved(m.id, 'carnicero') as id) rc on true
  left join public.players cpl on cpl.id = rc.id
  left join lateral (select public.match_award_resolved(m.id, 'pinocho') as id) rp on true
  left join public.players ppl on ppl.id = rp.id
  where c.grupo_id = p_grupo_id
    -- Ya jugado: resultado cargado o fecha pasada (igual que get_my_match_history).
    and (m.winner is not null or m.fecha < current_date)
    and (
      public.is_active_member_of_grupo(p_grupo_id)
      or public.can_manage_grupo(p_grupo_id)
    )
  order by m.fecha desc;
$$;

comment on function public.get_grupo_fechas(uuid) is
  'FUT-116: fechas YA JUGADAS del grupo (resultado + figura + carnicero + pinocho) visibles para cualquier miembro activo del grupo (o admin/coordinador), juegue o no. Pinocho solo si el grupo lo habilitó. Sin ratings internos. SECURITY DEFINER.';

revoke all on function public.get_grupo_fechas(uuid) from public;
grant execute on function public.get_grupo_fechas(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- get_grupo_fecha_stats: detalle de una fecha (jugadores por equipo + stats).
-- ----------------------------------------------------------------------------
create or replace function public.get_grupo_fecha_stats(p_match_id uuid)
returns table (
  player_id        uuid,
  nombre           text,
  apodo            text,
  team_label       text,
  is_goalkeeper    boolean,
  goles            int,
  asistencias      int,
  goles_en_contra  int
)
language sql
security definer
set search_path = ''
as $$
  select
    mtp.player_id,
    p.nombre,
    p.apodo,
    mt.team_label::text,
    mtp.is_goalkeeper,
    coalesce(s.goals, 0),
    coalesce(s.asistencias, 0),
    coalesce(s.own_goals, 0)
  from public.match_team_players mtp
  join public.match_teams mt on mt.id = mtp.match_team_id
  join public.matches m on m.id = mt.match_id
  join public.convocatorias c on c.id = m.convocatoria_id
  join public.players p on p.id = mtp.player_id
  left join public.match_player_stats s
    on s.match_id = m.id and s.player_id = mtp.player_id
  where m.id = p_match_id
    and (
      public.is_active_member_of_grupo(c.grupo_id)
      or public.can_manage_match(p_match_id)
    )
  order by mt.team_label nulls last, coalesce(nullif(p.apodo, ''), p.nombre);
$$;

comment on function public.get_grupo_fecha_stats(uuid) is
  'FUT-116: detalle de una fecha del grupo (jugadores por equipo + goles/asistencias/autogoles), visible para cualquier miembro activo del grupo (o quien gestiona el match). Sin ratings internos. SECURITY DEFINER.';

revoke all on function public.get_grupo_fecha_stats(uuid) from public;
grant execute on function public.get_grupo_fecha_stats(uuid) to authenticated;
