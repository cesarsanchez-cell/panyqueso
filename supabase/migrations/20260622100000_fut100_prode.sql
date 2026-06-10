-- ============================================================================
-- FUT-100: El Prode 🔮 — pronóstico del resultado del partido (v1)
-- ============================================================================
--
-- Engancha a TODO el grupo, jueguen o no el partido: cada miembro pronostica el
-- resultado y compite en una tabla anual.
--
-- Reglas (diseño cerrado con el usuario):
--   - Apuesta: acertar el GANADOR/empate = 1 pto; resultado EXACTO = 3 ptos.
--   - Ventana: ABRE cuando se publican los equipos (convocatoria 'cerrada', el
--     match ya existe) y CIERRA al inicio del partido (fecha + hora). Después,
--     firme. Status 'jugada' (resultado cargado) también cierra.
--   - 1 pronóstico editable por jugador y por match.
--   - Pronósticos OCULTOS hasta cerrar; al cerrar se REVELAN todos.
--   - Resuelve SOLO contra matches.score_team_a/b (el resultado que el admin ya
--     carga hoy). Partido sin resultado (winner null) = fecha anulada: nadie
--     suma.
--   - Pueden pronosticar y VER todos los miembros activos del grupo, juegue o no.
--   - Tabla acumulada por AÑO, reseteable por el admin.
--
-- Mismo patrón que la figura (FUT-99): RLS deny-all + todo el acceso por
-- funciones SECURITY DEFINER. pred_score_a/b corresponden a los equipos A/B del
-- match (match_teams.team_label).
-- ============================================================================

create table public.match_prode_predictions (
  id              uuid primary key default gen_random_uuid(),
  match_id        uuid not null references public.matches(id) on delete cascade,
  player_id       uuid not null references public.players(id) on delete cascade,
  pred_score_a    int not null check (pred_score_a >= 0 and pred_score_a <= 99),
  pred_score_b    int not null check (pred_score_b >= 0 and pred_score_b <= 99),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- 1 pronóstico editable por jugador y por partido.
  unique (match_id, player_id)
);

create index match_prode_predictions_match_idx
  on public.match_prode_predictions (match_id);

comment on table public.match_prode_predictions is
  'FUT-100: pronósticos del resultado (Prode). pred_score_a/b = equipos A/B del match. Pronostican los miembros activos del grupo (jueguen o no). Acceso solo via funciones SECURITY DEFINER; RLS deny-all.';

alter table public.match_prode_predictions enable row level security;

-- ----------------------------------------------------------------------------
-- _prode_kickoff: instante de inicio del partido (fecha + hora de la
--   convocatoria, interpretado en zona horaria de Argentina).
-- ----------------------------------------------------------------------------
create or replace function public._prode_kickoff(p_match_id uuid)
returns timestamptz
language sql
security definer
set search_path = ''
stable
as $$
  select (c.fecha + c.hora) at time zone 'America/Argentina/Buenos_Aires'
    from public.matches mt
    join public.convocatorias c on c.id = mt.convocatoria_id
   where mt.id = p_match_id;
$$;

-- ----------------------------------------------------------------------------
-- _prode_open: ventana abierta para un match. Abre con los equipos publicados
--   (convocatoria 'cerrada') y cierra al inicio del partido (kickoff).
-- ----------------------------------------------------------------------------
create or replace function public._prode_open(p_match_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (select c.status = 'cerrada'
       from public.matches mt
       join public.convocatorias c on c.id = mt.convocatoria_id
      where mt.id = p_match_id),
    false)
  and now() < public._prode_kickoff(p_match_id);
$$;

-- ----------------------------------------------------------------------------
-- _prode_points: puntos de un pronóstico contra el resultado real.
--   3 = resultado exacto, 1 = acertó ganador/empate, 0 = errado o sin
--   resultado.
-- ----------------------------------------------------------------------------
create or replace function public._prode_points(
  p_pred_a int, p_pred_b int, p_res_a int, p_res_b int
)
returns int
language sql
immutable
set search_path = ''
as $$
  select case
    when p_res_a is null or p_res_b is null then 0
    when p_pred_a = p_res_a and p_pred_b = p_res_b then 3
    when (p_pred_a > p_pred_b and p_res_a > p_res_b)
      or (p_pred_a < p_pred_b and p_res_a < p_res_b)
      or (p_pred_a = p_pred_b and p_res_a = p_res_b) then 1
    else 0
  end;
$$;

-- ----------------------------------------------------------------------------
-- cast_prode_prediction: el jugador logueado (miembro activo del grupo) carga
--   o edita su pronóstico. Solo con la ventana abierta. Upsert.
-- ----------------------------------------------------------------------------
create or replace function public.cast_prode_prediction(
  p_match_id uuid, p_score_a int, p_score_b int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player  uuid := public.current_player_id();
  v_grupo   uuid;
begin
  if v_player is null then
    raise exception 'no_player' using errcode = 'P0001';
  end if;

  if p_score_a is null or p_score_b is null
     or p_score_a < 0 or p_score_a > 99
     or p_score_b < 0 or p_score_b > 99 then
    raise exception 'invalid_score' using errcode = 'P0001';
  end if;

  select c.grupo_id into v_grupo
    from public.matches mt
    join public.convocatorias c on c.id = mt.convocatoria_id
   where mt.id = p_match_id;

  if v_grupo is null or not public.is_active_member_of_grupo(v_grupo) then
    raise exception 'not_group_member' using errcode = 'P0001';
  end if;

  if not public._prode_open(p_match_id) then
    raise exception 'prode_closed' using errcode = 'P0001';
  end if;

  insert into public.match_prode_predictions
    (match_id, player_id, pred_score_a, pred_score_b)
  values (p_match_id, v_player, p_score_a, p_score_b)
  on conflict (match_id, player_id)
  do update set pred_score_a = excluded.pred_score_a,
                pred_score_b = excluded.pred_score_b,
                updated_at   = now();
end;
$$;

-- ----------------------------------------------------------------------------
-- get_prode_state: estado del prode para el jugador logueado en un match.
--   Una sola row: si está abierto, el kickoff, el resultado real (null hasta
--   cargarse) y MI pronóstico. Solo para miembros activos del grupo.
-- ----------------------------------------------------------------------------
create or replace function public.get_prode_state(p_match_id uuid)
returns table (
  abierto      boolean,
  kickoff      timestamptz,
  result_a     int,
  result_b     int,
  mi_pred_a    int,
  mi_pred_b    int
)
language sql
security definer
set search_path = ''
as $$
  select
    public._prode_open(p_match_id),
    public._prode_kickoff(p_match_id),
    m.score_team_a,
    m.score_team_b,
    p.pred_score_a,
    p.pred_score_b
  from public.matches m
  left join public.match_prode_predictions p
    on p.match_id = m.id and p.player_id = public.current_player_id()
  where m.id = p_match_id
    and exists (
      select 1
        from public.convocatorias c
       where c.id = m.convocatoria_id
         and public.is_active_member_of_grupo(c.grupo_id)
    );
$$;

-- ----------------------------------------------------------------------------
-- get_prode_predictions: REVEAL de todos los pronósticos de un match. Solo
--   devuelve filas si la ventana ya CERRÓ (antes de cerrar, nadie ve lo de los
--   demás). Solo para miembros activos del grupo. puntos null si no hay
--   resultado todavía.
-- ----------------------------------------------------------------------------
create or replace function public.get_prode_predictions(p_match_id uuid)
returns table (
  player_id  uuid,
  nombre     text,
  apodo      text,
  pred_a     int,
  pred_b     int,
  puntos     int,
  es_mio     boolean
)
language sql
security definer
set search_path = ''
as $$
  select
    pr.player_id,
    pl.nombre,
    pl.apodo,
    pr.pred_score_a,
    pr.pred_score_b,
    case when m.winner is null then null
         else public._prode_points(pr.pred_score_a, pr.pred_score_b,
                                    m.score_team_a, m.score_team_b)
    end as puntos,
    pr.player_id = public.current_player_id() as es_mio
  from public.match_prode_predictions pr
  join public.matches m on m.id = pr.match_id
  join public.players pl on pl.id = pr.player_id
  join public.convocatorias c on c.id = m.convocatoria_id
  where pr.match_id = p_match_id
    and not public._prode_open(p_match_id)        -- reveal solo al cerrar
    and public.is_active_member_of_grupo(c.grupo_id)
  order by puntos desc nulls last,
           coalesce(nullif(pl.apodo, ''), pl.nombre);
$$;

-- ----------------------------------------------------------------------------
-- get_prode_tabla: ranking acumulado del Prode de un grupo en un año. Suma
--   puntos sobre los matches CON resultado (winner not null). Para miembros
--   activos del grupo o admin.
-- ----------------------------------------------------------------------------
create or replace function public.get_prode_tabla(p_grupo_id uuid, p_year int)
returns table (
  player_id         uuid,
  nombre            text,
  apodo             text,
  puntos            bigint,
  aciertos_exactos  bigint,
  pronosticos       bigint
)
language sql
security definer
set search_path = ''
as $$
  with autorizado as (
    select public.is_active_member_of_grupo(p_grupo_id)
        or public.current_user_role() = 'admin' as ok
  ),
  resueltos as (
    select pr.player_id,
           public._prode_points(pr.pred_score_a, pr.pred_score_b,
                                 m.score_team_a, m.score_team_b) as pts
      from public.match_prode_predictions pr
      join public.matches m on m.id = pr.match_id
      join public.convocatorias c on c.id = m.convocatoria_id
     where c.grupo_id = p_grupo_id
       and extract(year from c.fecha)::int = p_year
       and m.winner is not null
       and (select ok from autorizado)
  )
  select r.player_id,
         pl.nombre,
         pl.apodo,
         sum(r.pts)::bigint                         as puntos,
         count(*) filter (where r.pts = 3)::bigint  as aciertos_exactos,
         count(*)::bigint                           as pronosticos
    from resueltos r
    join public.players pl on pl.id = r.player_id
   group by r.player_id, pl.nombre, pl.apodo
   order by puntos desc, aciertos_exactos desc,
            coalesce(nullif(pl.apodo, ''), pl.nombre);
$$;

-- ----------------------------------------------------------------------------
-- admin_reset_prode: borra los pronósticos de un grupo en un año. Solo admin.
--   Devuelve la cantidad de pronósticos borrados.
-- ----------------------------------------------------------------------------
create or replace function public.admin_reset_prode(p_grupo_id uuid, p_year int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted int;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  delete from public.match_prode_predictions pr
   using public.matches m
   join public.convocatorias c on c.id = m.convocatoria_id
   where pr.match_id = m.id
     and c.grupo_id = p_grupo_id
     and extract(year from c.fecha)::int = p_year;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ----------------------------------------------------------------------------
-- get_my_prode: para la vista del jugador (/mi-perfil). Una row por grupo con
--   el PRÓXIMO match confirmado (fecha >= hoy) + el estado del prode de ese
--   match para el jugador logueado. Misma selección que
--   get_my_confirmed_match_teams para que el prode aparezca junto a los equipos.
-- ----------------------------------------------------------------------------
create or replace function public.get_my_prode()
returns table (
  grupo_id   uuid,
  match_id   uuid,
  fecha      date,
  kickoff    timestamptz,
  abierto    boolean,
  result_a   int,
  result_b   int,
  mi_pred_a  int,
  mi_pred_b  int
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
         px.match_id,
         px.fecha,
         public._prode_kickoff(px.match_id),
         public._prode_open(px.match_id),
         m.score_team_a,
         m.score_team_b,
         pr.pred_score_a,
         pr.pred_score_b
    from proximo px
    join public.matches m on m.id = px.match_id
    left join public.match_prode_predictions pr
      on pr.match_id = px.match_id
     and pr.player_id = public.current_player_id();
$$;

-- ----------------------------------------------------------------------------
-- Permisos: las funciones públicas a authenticated; las internas (_helpers)
-- quedan sin grant a public (las llaman las SECURITY DEFINER).
-- ----------------------------------------------------------------------------
revoke all on function public.cast_prode_prediction(uuid, int, int) from public;
grant execute on function public.cast_prode_prediction(uuid, int, int) to authenticated;
revoke all on function public.get_prode_state(uuid) from public;
grant execute on function public.get_prode_state(uuid) to authenticated;
revoke all on function public.get_prode_predictions(uuid) from public;
grant execute on function public.get_prode_predictions(uuid) to authenticated;
revoke all on function public.get_prode_tabla(uuid, int) from public;
grant execute on function public.get_prode_tabla(uuid, int) to authenticated;
revoke all on function public.admin_reset_prode(uuid, int) from public;
grant execute on function public.admin_reset_prode(uuid, int) to authenticated;
revoke all on function public.get_my_prode() from public;
grant execute on function public.get_my_prode() to authenticated;
