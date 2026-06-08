-- ============================================================================
-- Vista jugador v3: indicador de balance neutro en get_my_confirmed_match_teams
-- ============================================================================
--
-- Suma una columna balance_hint al RPC de equipos confirmados: un enum neutro
-- por partido que le dice al jugador si los equipos estan parejos o cual viene
-- un poco abajo, SIN exponer ningun numero ni rating (ver CLAUDE.md privacidad).
--
--   balance_hint in ('parejos', 'equipo_A_abajo', 'equipo_B_abajo')
--
-- Se calcula adentro (SECURITY DEFINER) sumando players.internal_score por
-- equipo; al cliente solo llega el enum cualitativo, nunca la suma. Umbral de
-- "parejos" BAJO (2%) a proposito: la idea es que el distintivo del underdog
-- aparezca seguido para estimular al equipo mas flojo (parte del juego). Es una
-- constante facil de afinar (BALANCE_PAREJOS_PCT mas abajo).
--
-- La columna viene repetida en cada fila del grupo (incluido el banco); el
-- cliente agrupa por grupo y lee una.
--
-- Cambia la firma (agrega columna) => hay que DROP + CREATE, no basta REPLACE.
-- ============================================================================
drop function if exists public.get_my_confirmed_match_teams();

create function public.get_my_confirmed_match_teams()
returns table (
  grupo_id      uuid,
  fecha         date,
  team_label    text,
  player_id     uuid,
  nombre        text,
  apodo         text,
  is_goalkeeper boolean,
  balance_hint  text
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
  -- Proximo match confirmado por grupo: el de menor fecha >= hoy.
  proximo as (
    select distinct on (c.grupo_id)
           c.grupo_id,
           c.id   as convocatoria_id,
           m.id   as match_id,
           m.fecha
      from public.matches m
      join public.convocatorias c on c.id = m.convocatoria_id
     where c.grupo_id in (select grupo_id from mis_grupos)
       and m.fecha >= current_date
     order by c.grupo_id, m.fecha asc
  ),
  -- Balance neutro: suma de internal_score por equipo, SOLO para derivar el
  -- enum. Umbral de "parejos" bajo (2%) para estimular al equipo mas flojo.
  balance as (
    select px.grupo_id,
           sum(case when mt.team_label = 'A' then coalesce(p.internal_score, 0) else 0 end) as score_a,
           sum(case when mt.team_label = 'B' then coalesce(p.internal_score, 0) else 0 end) as score_b
      from proximo px
      join public.match_teams mt on mt.match_id = px.match_id
      join public.match_team_players mtp on mtp.match_team_id = mt.id
      join public.players p on p.id = mtp.player_id
     group by px.grupo_id
  ),
  hint as (
    select grupo_id,
           case
             -- BALANCE_PAREJOS_PCT = 0.02 (umbral bajo, afinable).
             when (score_a + score_b) = 0 then 'parejos'
             when abs(score_a - score_b) / ((score_a + score_b) / 2.0) <= 0.02 then 'parejos'
             when score_a < score_b then 'equipo_A_abajo'
             else 'equipo_B_abajo'
           end as balance_hint
      from balance
  ),
  -- Jugadores de los equipos A/B.
  equipos as (
    select px.grupo_id,
           px.fecha,
           mt.team_label::text                       as team_label,
           mtp.player_id,
           p.nombre,
           p.apodo,
           mtp.is_goalkeeper,
           0                                          as bucket,
           case mt.team_label when 'A' then 0 else 1 end as ord1,
           (not mtp.is_goalkeeper)::int               as ord2,
           p.nombre                                   as ord3
      from proximo px
      join public.match_teams mt on mt.match_id = px.match_id
      join public.match_team_players mtp on mtp.match_team_id = mt.id
      join public.players p on p.id = mtp.player_id
  ),
  -- Banco: suplentes no-declinados de la convocatoria origen (no entran a un
  -- equipo, esperan en la cola). team_label NULL los distingue.
  banco as (
    select px.grupo_id,
           px.fecha,
           null::text                                 as team_label,
           cp.player_id,
           p.nombre,
           p.apodo,
           false                                      as is_goalkeeper,
           1                                          as bucket,
           0                                          as ord1,
           coalesce(cp.orden_suplente, 0)             as ord2,
           p.nombre                                   as ord3
      from proximo px
      join public.convocatoria_players cp on cp.convocatoria_id = px.convocatoria_id
      join public.players p on p.id = cp.player_id
     where cp.rol_en_convocatoria = 'suplente'
       and cp.attendance_status <> 'declinado'
       and cp.player_id is not null
  )
  select u.grupo_id,
         u.fecha,
         u.team_label,
         u.player_id,
         u.nombre,
         u.apodo,
         u.is_goalkeeper,
         h.balance_hint
    from (
      select * from equipos
      union all
      select * from banco
    ) u
    left join hint h on h.grupo_id = u.grupo_id
   order by u.grupo_id, u.bucket, u.ord1, u.ord2, u.ord3;
$$;

comment on function public.get_my_confirmed_match_teams() is
  'Fase 10 + vista jugador v3: equipos del proximo match confirmado (fecha >= hoy) de cada grupo del jugador + banco (team_label NULL) + balance_hint neutro (parejos/equipo_A_abajo/equipo_B_abajo). Solo datos neutrales; el hint se deriva de internal_score adentro (SECURITY DEFINER) pero nunca se exponen los numeros. SECURITY DEFINER porque matches/* y convocatoria_players son admin+veedor por RLS.';

revoke all on function public.get_my_confirmed_match_teams() from public;
grant execute on function public.get_my_confirmed_match_teams() to authenticated;
