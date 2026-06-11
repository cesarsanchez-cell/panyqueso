-- ============================================================================
-- FUT-107e (Fase 11, Bloque 2, 2b — Config del grupo + Prode + Rating x grupo)
-- ============================================================================
--
-- Último dominio del rescopeo. Pasa a can_manage_grupo:
--
--   A) grupos (RLS): SELECT y UPDATE de la fila del grupo (config: nombre, día,
--      hora, cupo, lugar, veedor_activo, premio_pinocho). INSERT queda admin-only
--      (el coordinador NO crea grupos). DELETE sigue bloqueado.
--
--   B) Funciones rating x grupo (FUT-104), hoy admin-only:
--      - set_grupo_requiere_veedor(grupo, value)   → gate del veedor del grupo
--      - propose_group_rating_change(player, grupo, …) → editar rating del grupo
--      - get_group_rating(player, grupo)           → lectura del rating del grupo
--
--   C) Funciones Prode (FUT-100), hoy admin-only / solo-miembro:
--      - admin_reset_prode(grupo, year)            → resetear la tabla anual
--      - get_prode_tabla(grupo, year)              → ver la tabla del grupo
--      - get_prode_predictions(match)              → ver los pronósticos del match
--
-- El coordinador opera SOLO su(s) grupo(s). admin y veedor sin cambios.
-- can_manage_grupo es SECURITY DEFINER (solo consulta coordinador_grupos) → sin
-- recursión con las policies player de grupos. La capa app (requireRole) es 2c.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A) grupos: SELECT + UPDATE → can_manage_grupo. INSERT admin (sin tocar).
-- ----------------------------------------------------------------------------
drop policy if exists grupos_select_admin_veedor on public.grupos;
create policy grupos_select_admin_veedor
  on public.grupos
  for select
  to authenticated
  using (
    public.current_user_role() in ('admin', 'veedor')
    or public.can_manage_grupo(id)
  );

drop policy if exists grupos_update_admin on public.grupos;
create policy grupos_update_grupo
  on public.grupos
  for update
  to authenticated
  using (public.can_manage_grupo(id))
  with check (public.can_manage_grupo(id));

-- ----------------------------------------------------------------------------
-- B) Rating x grupo (FUT-104): gate admin → can_manage_grupo(p_grupo_id)
-- ----------------------------------------------------------------------------
create or replace function public.set_grupo_requiere_veedor(p_grupo_id uuid, p_value boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'auth_required' using errcode = 'P0001';
  end if;

  if not public.can_manage_grupo(p_grupo_id) then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;

  update public.grupos
     set veedor_activo = p_value
   where id = p_grupo_id;

  if not found then
    raise exception 'grupo_not_found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (actor_id, entity, entity_id, action, payload)
  values (
    v_caller_id, 'grupos', p_grupo_id, 'set_grupo_requiere_veedor',
    jsonb_build_object('veedor_activo', p_value)
  );
end;
$$;

create or replace function public.propose_group_rating_change(
  p_player_id uuid,
  p_grupo_id  uuid,
  p_proposed  jsonb,
  p_reason    text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_old       jsonb;
  v_request_id uuid;
  v_applied   boolean := false;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'auth_required' using errcode = 'P0001';
  end if;

  if not public.can_manage_grupo(p_grupo_id) then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  -- Tiene que existir el rating del grupo (lo siembra la membresía, FUT-103).
  v_old := public._group_rating_snapshot(p_player_id, p_grupo_id);
  if v_old is null then
    raise exception 'no_group_rating' using errcode = 'P0014';
  end if;

  insert into public.player_change_requests (
    player_id, grupo_id, action_type, requested_by,
    old_values, proposed_values, fields_changed, reason
  )
  values (
    p_player_id, p_grupo_id, 'update_sensitive_fields', v_caller_id,
    v_old, p_proposed,
    (select array_agg(k) from jsonb_object_keys(p_proposed) k),
    p_reason
  )
  returning id into v_request_id;

  -- Si el grupo no audita, se aplica directo (manteniendo la traza).
  if not public.grupo_requiere_veedor(p_grupo_id) then
    perform public._apply_group_rating_request(v_request_id, v_caller_id, p_reason, 'admin_apply_direct');
    v_applied := true;
  end if;

  return jsonb_build_object('request_id', v_request_id, 'applied', v_applied);
end;
$$;

create or replace function public.get_group_rating(p_player_id uuid, p_grupo_id uuid)
returns table (
  player_id          uuid,
  grupo_id           uuid,
  phys_power         int,
  phys_speed         int,
  phys_stamina       int,
  ment_tactical      int,
  ment_resilience    int,
  ment_attitude      int,
  tech_passing       int,
  tech_finishing     int,
  tech_linkup        int,
  technical          int,
  physical           int,
  mental             int,
  internal_score     numeric,
  role_field         public.player_role_field,
  position_pref      public.position_pref,
  positions_possible public.position_pref[],
  rating_confidence  public.rating_confidence
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.player_id, r.grupo_id,
         r.phys_power, r.phys_speed, r.phys_stamina,
         r.ment_tactical, r.ment_resilience, r.ment_attitude,
         r.tech_passing, r.tech_finishing, r.tech_linkup,
         r.technical, r.physical, r.mental, r.internal_score,
         r.role_field, r.position_pref, r.positions_possible, r.rating_confidence
    from public.player_group_ratings r
   where r.player_id = p_player_id
     and r.grupo_id  = p_grupo_id
     and (
       public.current_user_role() in ('admin', 'veedor')
       or public.can_manage_grupo(p_grupo_id)
     );
$$;

-- ----------------------------------------------------------------------------
-- C) Prode (FUT-100): admin/solo-miembro → + can_manage_grupo / can_manage_match
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
    and (
      public.is_active_member_of_grupo(c.grupo_id)
      or public.can_manage_match(p_match_id)
    )
  order by puntos desc nulls last,
           coalesce(nullif(pl.apodo, ''), pl.nombre);
$$;

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
        or public.current_user_role() = 'admin'
        or public.can_manage_grupo(p_grupo_id) as ok
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

create or replace function public.admin_reset_prode(p_grupo_id uuid, p_year int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted int;
begin
  if not public.can_manage_grupo(p_grupo_id) then
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
