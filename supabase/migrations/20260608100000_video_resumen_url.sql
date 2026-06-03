-- ============================================================================
-- Vista jugador: link al video resumen del partido (FUT-80)
-- ============================================================================
--
-- El partido se graba con un servicio de camara en la cancha (ej. SportsReel).
-- El admin pega el LINK del resumen; NO se aloja el archivo (decision FUT-80:
-- solo link). Es un dato neutro/positivo -> permitido en la vista del jugador
-- segun CLAUDE.md.
--
-- (1) matches.video_resumen_url: link nullable, solo https, hasta 2048 chars.
--     La escritura la hace el admin via UPDATE directo (la RLS de matches ya es
--     INSERT/UPDATE admin-only, mismo patron que la carga de goles); no hace
--     falta un RPC SECURITY DEFINER nuevo.
-- (2) get_my_match_history: devuelve el link para mostrar un boton "Ver video"
--     en /historial. Agregar una columna cambia el return type, y
--     create or replace no permite cambiar columnas de retorno -> drop + create.
-- ============================================================================

alter table public.matches
  add column video_resumen_url text;

alter table public.matches
  add constraint matches_video_resumen_url_valida check (
    video_resumen_url is null
    or (video_resumen_url ~ '^https://' and length(video_resumen_url) <= 2048)
  );

comment on column public.matches.video_resumen_url is
  'Link externo al video resumen del partido (ej. SportsReel/YouTube/Drive). No se aloja el archivo. Solo https, hasta 2048 chars. Lo carga el admin; visible al jugador en /historial.';

-- ----------------------------------------------------------------------------
-- get_my_match_history: suma video_resumen_url al final del row.
-- ----------------------------------------------------------------------------
drop function if exists public.get_my_match_history();

create or replace function public.get_my_match_history()
returns table (
  match_id          uuid,
  grupo_id          uuid,
  grupo_nombre      text,
  fecha             date,
  team_label        text,
  resultado         text,
  goles             int,
  video_resumen_url text
)
language sql
security definer
set search_path = ''
as $$
  with mi as (
    select public.current_player_id() as pid
  ),
  mis_partidos as (
    select m.id            as match_id,
           c.grupo_id,
           m.fecha,
           mt.team_label::text as team_label,
           m.winner::text   as winner,
           m.video_resumen_url
      from public.match_team_players mtp
      join public.match_teams mt on mt.id = mtp.match_team_id
      join public.matches m on m.id = mt.match_id
      join public.convocatorias c on c.id = m.convocatoria_id
     where mtp.player_id = (select pid from mi)
       and m.fecha < current_date
  )
  select mp.match_id,
         mp.grupo_id,
         g.nombre as grupo_nombre,
         mp.fecha,
         mp.team_label,
         case
           when mp.winner is null then 'sin_resultado'
           when mp.winner = 'empate' then 'empate'
           when (mp.winner = 'a' and mp.team_label = 'A')
             or (mp.winner = 'b' and mp.team_label = 'B') then 'ganado'
           else 'perdido'
         end as resultado,
         coalesce(s.goals, 0) as goles,
         mp.video_resumen_url
    from mis_partidos mp
    left join public.grupos g on g.id = mp.grupo_id
    left join public.match_player_stats s
      on s.match_id = mp.match_id and s.player_id = (select pid from mi)
   order by mp.fecha desc;
$$;

comment on function public.get_my_match_history() is
  'Fase 10 / FUT-80: historial de partidos PASADOS (fecha < hoy) del jugador autenticado, por grupo, con resultado, goles y link al video resumen (si hay). Solo datos neutrales/positivos; sin scores internos. SECURITY DEFINER porque matches/* son admin+veedor por RLS.';

revoke all on function public.get_my_match_history() from public;
grant execute on function public.get_my_match_history() to authenticated;
