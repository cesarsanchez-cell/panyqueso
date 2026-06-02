-- ============================================================================
-- Fase 10 fix: set_convocatoria_cupo rompia con duplicate key
-- ============================================================================
--
-- El reacomodo de roster se hacia en UN solo UPDATE que renumeraba
-- orden_suplente. El indice unico parcial convocatoria_players_suplente_orden_uq
-- (convocatoria_id, orden_suplente where suplente y no-declinado) se chequea
-- fila por fila durante el UPDATE, asi que al renumerar suplentes existentes
-- hay un choque TRANSITORIO (dos filas comparten un orden por un instante)
-- aunque el estado final sea unico:
--   "duplicate key value violates unique constraint
--    convocatoria_players_suplente_orden_uq"
--
-- Fix: dos fases.
--   1. Snapshot del orden actual (titulares por antiguedad, luego suplentes por
--      su orden de cola) ANTES de tocar nada.
--   2. Limpiar: todos los no-declinados pasan a titular con orden_suplente NULL
--      -> el indice parcial de suplentes queda VACIO para esta convocatoria.
--   3. Asignar el split final desde el snapshot: primeros N titulares, resto
--      suplentes 1..M. Como el indice estaba vacio y los nuevos orden son
--      distintos, no hay colision ni transitoria.
-- ============================================================================
create or replace function public.set_convocatoria_cupo(
  p_convocatoria_id uuid,
  p_nuevo_cupo      int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.convocatorias%rowtype;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_conv from public.convocatorias where id = p_convocatoria_id for update;
  if not found then
    raise exception 'convocatoria_not_found' using errcode = 'P0053';
  end if;
  if v_conv.status <> 'abierta' then
    raise exception 'convocatoria_no_abierta' using errcode = 'P0060';
  end if;
  if p_nuevo_cupo < 6 or p_nuevo_cupo > 24 then
    raise exception 'cupo_fuera_de_rango'
      using errcode = 'P0061', detail = p_nuevo_cupo::text;
  end if;

  update public.convocatorias
     set cupo_maximo = p_nuevo_cupo
   where id = p_convocatoria_id;

  -- 1. Snapshot del orden actual (antes de mutar rol/orden). Titulares primero
  --    (por antiguedad/added_at), luego suplentes (por orden de cola).
  drop table if exists pg_temp.cupo_resplit;
  create temp table cupo_resplit on commit drop as
  select cp.id,
         row_number() over (
           order by
             (case when cp.rol_en_convocatoria = 'titular' then 0 else 1 end),
             (case when cp.rol_en_convocatoria = 'titular'
                   then extract(epoch from cp.added_at)
                   else cp.orden_suplente::numeric end),
             cp.id
         ) as pos
    from public.convocatoria_players cp
   where cp.convocatoria_id = p_convocatoria_id
     and cp.attendance_status <> 'declinado';

  -- 2. Limpiar: todos a titular (orden NULL) -> vacia el indice parcial de
  --    suplentes para esta convocatoria, evitando choques transitorios.
  update public.convocatoria_players
     set rol_en_convocatoria = 'titular',
         orden_suplente = null,
         updated_at = now()
   where convocatoria_id = p_convocatoria_id
     and attendance_status <> 'declinado';

  -- 3. Asignar split final desde el snapshot.
  update public.convocatoria_players cp
     set rol_en_convocatoria =
           (case when r.pos <= p_nuevo_cupo then 'titular' else 'suplente' end)::public.membresia_tipo,
         orden_suplente =
           case when r.pos <= p_nuevo_cupo then null else (r.pos - p_nuevo_cupo)::int end,
         updated_at = now()
    from pg_temp.cupo_resplit r
   where cp.id = r.id;

  drop table if exists pg_temp.cupo_resplit;
end;
$$;

comment on function public.set_convocatoria_cupo(uuid, int) is
  'Fase 10 (fix): cambia la cantidad de titulares de una convocatoria ABIERTA reacomodando el roster no-declinado en DOS fases (limpiar a titular + reasignar desde snapshot) para no chocar con el indice unico parcial de orden_suplente. P0060 si no esta abierta, P0061 si el cupo esta fuera de 6..24. SECURITY DEFINER, admin-only.';

revoke all on function public.set_convocatoria_cupo(uuid, int) from public;
grant execute on function public.set_convocatoria_cupo(uuid, int) to authenticated;
