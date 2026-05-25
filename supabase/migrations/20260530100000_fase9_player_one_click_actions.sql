-- ============================================================================
-- Fase 9 PR C: acciones de un click para el jugador
-- ============================================================================
--
-- Principio (ver memory feedback_friction_belongs_on_admin): el jugador
-- invitado solo quiere jugar. Sus interacciones recurrentes con la app deben
-- ser de un click. Esta migracion habilita las dos accionas de /mi-perfil:
--
--   1. "No voy" para la proxima convocatoria.
--      -> player_decline_convocatoria(convocatoria_id)
--      -> marca attendance='declinado'. Si era titular del grupo (y la conv
--         pertenece a un grupo), inactiva la membresia y promueve al suplente
--         #1 a titular. Renumera la cola de suplentes para mantener FIFO
--         contiguo (#2 -> #1, #3 -> #2, etc).
--
--   2. "Anotarme en la cola" de un grupo donde el jugador no es miembro
--      activo (ex titular bajado, o nunca fue).
--      -> player_join_suplente_queue(grupo_id)
--      -> reactiva la membresia inactive si existe, o inserta nueva con
--         tipo='suplente', orden=max+1, status='activo'.
--
-- Tambien sumamos SELECT policies para que el rol player pueda:
--   - leer sus propias filas en convocatoria_players (y la convocatoria
--     correspondiente),
--   - leer sus propias filas en grupo_membresias (activas e inactivas, para
--     poder mostrar "Anotarme en la cola" en grupos donde se bajo),
--   - ver grupos donde tiene cualquier membresia (no solo activa).
--
-- Las acciones que tocan multiples filas (decline + promote, renumber, etc)
-- viven en funciones SECURITY DEFINER porque cruzan RLS y necesitan logica
-- transaccional. RLS de las tablas sigue siendo estricta para los UPDATEs
-- directos (solo admin).
-- ============================================================================

-- 1. SELECT policies para el rol 'player' -----------------------------------

-- 1a. convocatoria_players: el player ve sus propias filas.
create policy convocatoria_players_select_self_player
  on public.convocatoria_players
  for select
  to authenticated
  using (
    public.current_user_role() = 'player'
    and player_id = public.current_player_id()
  );

comment on policy convocatoria_players_select_self_player on public.convocatoria_players is
  'Fase 9 PR C: el jugador puede leer su propia invitacion a una convocatoria (para mostrar "no voy" en /mi-perfil).';

-- 1b. convocatorias: el player ve las convocatorias donde esta invitado.
create policy convocatorias_select_player_invited
  on public.convocatorias
  for select
  to authenticated
  using (
    public.current_user_role() = 'player'
    and exists (
      select 1
        from public.convocatoria_players cp
       where cp.convocatoria_id = public.convocatorias.id
         and cp.player_id = public.current_player_id()
    )
  );

comment on policy convocatorias_select_player_invited on public.convocatorias is
  'Fase 9 PR C: el jugador puede leer las convocatorias donde fue invitado (para mostrar fecha/grupo en /mi-perfil).';

-- 1c. grupo_membresias: el player ve TODAS sus membresias (activas e
-- inactivas). La policy existente grupo_membresias_select_player solo
-- expone membresias en grupos donde es miembro ACTIVO. Esta complementa
-- para que pueda ver sus ex-membresias (caso "me bajé como titular, ahora
-- me quiero re-anotar").
create policy grupo_membresias_select_self_player
  on public.grupo_membresias
  for select
  to authenticated
  using (
    public.current_user_role() = 'player'
    and player_id = public.current_player_id()
  );

comment on policy grupo_membresias_select_self_player on public.grupo_membresias is
  'Fase 9 PR C: el jugador puede leer todas sus propias filas (activas e inactivas) para poder reactivar membresias.';

-- 1d. grupos: el player ve grupos donde fue/es miembro (activo o no).
create policy grupos_select_player_any_membership
  on public.grupos
  for select
  to authenticated
  using (
    public.current_user_role() = 'player'
    and exists (
      select 1
        from public.grupo_membresias gm
       where gm.grupo_id = public.grupos.id
         and gm.player_id = public.current_player_id()
    )
  );

comment on policy grupos_select_player_any_membership on public.grupos is
  'Fase 9 PR C: el jugador puede leer los grupos donde fue miembro (incluyendo inactivos), para listar opciones de re-ingreso a cola.';

-- 2. player_decline_convocatoria ---------------------------------------------
-- Marca declinado y, si corresponde, libera titularidad + promueve suplente.
-- Idempotente: si ya esta declinado, retorna ok sin cambios.
create or replace function public.player_decline_convocatoria(p_convocatoria_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id    uuid;
  v_cp_id        uuid;
  v_cp_status    public.attendance_status;
  v_grupo_id     uuid;
  v_was_titular  boolean;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'not_a_player' using errcode = 'P0040';
  end if;

  -- Lock el row de invitacion del player en esta convocatoria.
  select id, attendance_status
    into v_cp_id, v_cp_status
    from public.convocatoria_players
   where convocatoria_id = p_convocatoria_id
     and player_id = v_player_id
   for update;

  if not found then
    raise exception 'not_invited' using errcode = 'P0041';
  end if;

  -- Idempotente.
  if v_cp_status = 'declinado' then
    return;
  end if;

  update public.convocatoria_players
     set attendance_status = 'declinado',
         updated_at = now()
   where id = v_cp_id;

  -- ¿La convocatoria pertenece a un grupo? Si no (MVP-style), no hay FIFO.
  select grupo_id into v_grupo_id
    from public.convocatorias
   where id = p_convocatoria_id;

  if v_grupo_id is null then
    return;
  end if;

  -- ¿El jugador era titular activo de ese grupo?
  select exists (
    select 1
      from public.grupo_membresias
     where grupo_id = v_grupo_id
       and player_id = v_player_id
       and tipo = 'titular'
       and status = 'activo'
  ) into v_was_titular;

  if not v_was_titular then
    return;
  end if;

  -- Inactivar la membresia del titular que se baja.
  update public.grupo_membresias
     set status = 'inactivo',
         inactivated_at = now()
   where grupo_id = v_grupo_id
     and player_id = v_player_id
     and tipo = 'titular'
     and status = 'activo';

  -- Promover al primer suplente activo (orden=1) a titular.
  update public.grupo_membresias
     set tipo  = 'titular',
         orden = null
   where id = (
     select id
       from public.grupo_membresias
      where grupo_id = v_grupo_id
        and tipo = 'suplente'
        and status = 'activo'
      order by orden asc
      limit 1
   );

  -- Renumerar la cola para mantener FIFO contiguo (1, 2, 3, ...). Hacemos
  -- dos pasos por la unique partial index (grupo_id, orden) where
  -- status='activo' and tipo='suplente': primero corremos a un rango libre,
  -- luego asignamos row_number().
  update public.grupo_membresias
     set orden = orden + 1000000
   where grupo_id = v_grupo_id
     and tipo = 'suplente'
     and status = 'activo';

  with ranked as (
    select id, row_number() over (order by orden) as r
      from public.grupo_membresias
     where grupo_id = v_grupo_id
       and tipo = 'suplente'
       and status = 'activo'
  )
  update public.grupo_membresias gm
     set orden = ranked.r
    from ranked
   where gm.id = ranked.id;
end;
$$;

comment on function public.player_decline_convocatoria(uuid) is
  'Fase 9 PR C: el jugador se baja de una convocatoria (un click). Marca declinado, y si era titular del grupo asociado, libera titularidad y promueve al suplente #1 renumerando la cola.';

revoke all on function public.player_decline_convocatoria(uuid) from public;
grant execute on function public.player_decline_convocatoria(uuid) to authenticated;

-- 3. player_join_suplente_queue ----------------------------------------------
-- Reactiva la membresia inactive del player en el grupo, o inserta nueva.
-- En ambos casos queda como suplente con orden=max(orden activos)+1.
create or replace function public.player_join_suplente_queue(p_grupo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id     uuid;
  v_grupo_status  public.grupo_status;
  v_inactive_id   uuid;
  v_active_id     uuid;
  v_next_orden    int;
begin
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception 'not_a_player' using errcode = 'P0040';
  end if;

  select status into v_grupo_status
    from public.grupos
   where id = p_grupo_id;

  if not found then
    raise exception 'grupo_not_found' using errcode = 'P0042';
  end if;

  if v_grupo_status <> 'activo' then
    raise exception 'grupo_not_active' using errcode = 'P0043';
  end if;

  -- Si ya esta activo en el grupo (titular o suplente), no hacemos nada.
  select id into v_active_id
    from public.grupo_membresias
   where grupo_id = p_grupo_id
     and player_id = v_player_id
     and status = 'activo'
   for update;

  if found then
    raise exception 'already_active_in_grupo' using errcode = 'P0044';
  end if;

  select coalesce(max(orden), 0) + 1 into v_next_orden
    from public.grupo_membresias
   where grupo_id = p_grupo_id
     and tipo = 'suplente'
     and status = 'activo';

  -- Buscar membresia inactiva previa para reactivar.
  select id into v_inactive_id
    from public.grupo_membresias
   where grupo_id = p_grupo_id
     and player_id = v_player_id
     and status = 'inactivo'
   order by inactivated_at desc nulls last
   limit 1
   for update;

  if found then
    update public.grupo_membresias
       set tipo           = 'suplente',
           orden          = v_next_orden,
           status         = 'activo',
           inactivated_at = null,
           inactivated_by = null
     where id = v_inactive_id;
  else
    insert into public.grupo_membresias (grupo_id, player_id, tipo, orden, status)
    values (p_grupo_id, v_player_id, 'suplente', v_next_orden, 'activo');
  end if;
end;
$$;

comment on function public.player_join_suplente_queue(uuid) is
  'Fase 9 PR C: el jugador se suma a la cola de suplentes de un grupo (un click). Reactiva su membresia inactiva si existe, o inserta nueva. Lanza P0044 si ya esta activo en el grupo.';

revoke all on function public.player_join_suplente_queue(uuid) from public;
grant execute on function public.player_join_suplente_queue(uuid) to authenticated;
