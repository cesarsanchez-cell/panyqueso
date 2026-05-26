-- ============================================================================
-- Fase 9: schema para auto-renovacion de convocatorias (PR-A)
-- ============================================================================
--
-- Base schema para que las convocatorias se auto-generen y auto-cierren a
-- partir de un grupo recurrente, sin que el admin tenga que crearlas a mano
-- ni el jugador vea la palabra "convocatoria". El jugador ve "tu proximo
-- partido es el martes 27".
--
-- Esta migracion NO incluye logica (RPC ni cron). Solo el schema necesario.
-- La logica viene en PR-B (RPC close_and_create_next_convocatoria) y PR-C
-- (Vercel Cron).
--
-- Decisiones:
--
-- 1. grupos.auto_renovar (boolean, default true)
--    Si true, el sistema cierra la convocatoria actual 1h despues del partido
--    y crea la siguiente automaticamente. Si false, el admin gestiona las
--    convocatorias manualmente (caso ad-hoc, partidos sueltos).
--
-- 2. grupos.cierre_minutes_after_start (int, default 60)
--    Cuantos minutos despues del horario del partido la convocatoria se
--    considera cerrada. Configurable por si algun grupo juega 1h30 o quiere
--    margen distinto.
--
-- 3. convocatorias.modo (enum, default 'cerrada')
--    'cerrada': los miembros estan pre-cargados desde la membresia del
--               grupo (Modelo 2, el que estamos cerrando primero).
--    'abierta': anuncio masivo, los miembros se anotan (Modelo 1, futuro).
--    Default cerrada para compat con todo lo existente.
--
-- 4. convocatorias.cupo_max (int NULL)
--    Solo aplica en modo='abierta'. NULL = sin tope. Cuando se llena, los
--    nuevos van a lista_espera. Forward-compatible, no se usa todavia.
--
-- 5. convocatorias.cierre_at (timestamptz NULL)
--    Timestamp calculado al crear la convocatoria = fecha + grupo.hora +
--    grupo.cierre_minutes_after_start. El cron busca convocatorias con
--    status='abierta' y cierre_at < now() para procesarlas. Indice partial
--    porque el cron filtra por status.
--
-- 6. convocatoria_players.waitlist_order (int NULL)
--    Solo aplica con attendance_status='lista_espera'. Orden de anotacion
--    para promover al primero cuando se libera cupo. Forward-compatible.
--
-- 7. attendance_status: agregar valor 'lista_espera'
--    Para que un miembro pueda estar invitado a una conv abierta pero no
--    confirmado todavia porque ya se lleno el cupo. Forward-compatible.
--
-- Todas las columnas NULL o con default para no romper rows existentes ni
-- el flow de creacion manual de convocatorias del MVP.
-- ============================================================================

-- 1. Enum nuevo para modo de convocatoria.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'convocatoria_modo') then
    create type public.convocatoria_modo as enum ('cerrada', 'abierta');
  end if;
end$$;

-- 2. Columnas nuevas en convocatorias.
alter table public.convocatorias
  add column if not exists modo public.convocatoria_modo not null default 'cerrada';

alter table public.convocatorias
  add column if not exists cupo_max int;

alter table public.convocatorias
  add column if not exists cierre_at timestamptz;

comment on column public.convocatorias.modo is
  'Fase 9 auto-renovacion: cerrada = pre-cargada desde grupo (Modelo 2). abierta = anuncio publico con auto-anotacion (Modelo 1, futuro).';
comment on column public.convocatorias.cupo_max is
  'Fase 9 (Modelo 1, futuro): tope de jugadores en modo abierta. NULL = sin tope. No se usa en modo cerrada.';
comment on column public.convocatorias.cierre_at is
  'Fase 9 auto-renovacion: timestamp calculado al crear la convocatoria. El cron busca convocatorias con status=abierta y cierre_at < now() para procesarlas.';

-- Indice para el cron: buscar convocatorias abiertas vencidas.
create index if not exists convocatorias_cron_due_idx
  on public.convocatorias (cierre_at)
  where status = 'abierta' and cierre_at is not null;

-- 3. Columnas nuevas en grupos.
alter table public.grupos
  add column if not exists auto_renovar boolean not null default true;

alter table public.grupos
  add column if not exists cierre_minutes_after_start int not null default 60
  check (cierre_minutes_after_start between 0 and 1440);

comment on column public.grupos.auto_renovar is
  'Fase 9 auto-renovacion: si true, el sistema cierra y crea la siguiente convocatoria automaticamente. Si false, admin gestiona convocatorias a mano.';
comment on column public.grupos.cierre_minutes_after_start is
  'Fase 9 auto-renovacion: cuantos minutos despues del horario del partido la convocatoria se considera cerrada. Default 60.';

-- 4. Agregar valor lista_espera al enum attendance_status (forward-compat
-- con Modelo 1). PostgreSQL no permite alter enum dentro de una transaccion
-- en algunos contextos; usamos add value if not exists.
do $$
begin
  if not exists (
    select 1
      from pg_enum e
      join pg_type t on e.enumtypid = t.oid
     where t.typname = 'attendance_status'
       and e.enumlabel = 'lista_espera'
  ) then
    alter type public.attendance_status add value 'lista_espera';
  end if;
end$$;

-- 5. Columna waitlist_order en convocatoria_players.
alter table public.convocatoria_players
  add column if not exists waitlist_order int;

comment on column public.convocatoria_players.waitlist_order is
  'Fase 9 (Modelo 1, futuro): orden FIFO de anotacion cuando attendance_status=lista_espera. NULL en otros estados.';

-- Nota: el unique index parcial sobre attendance_status='lista_espera' no se
-- puede crear en esta misma migracion porque PostgreSQL no deja usar un valor
-- de enum recien agregado en la misma transaccion. Se crea en la migracion
-- siguiente.
