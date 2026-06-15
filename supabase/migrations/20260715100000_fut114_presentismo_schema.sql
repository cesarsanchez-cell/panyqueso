-- ============================================================================
-- FUT-114 (Fase 12 / A1): schema del modo "presentismo en cancha"
-- ============================================================================
--
-- Un grupo puede confirmar de dos maneras:
--   - 'convocatoria' (default, lo de siempre): roster pre-cargado desde la
--     membresía, lista que se anota antes.
--   - 'presentismo': la confirmación es PRESENTARSE en la cancha. No hay roster
--     previo; el coordinador hace check-in en vivo por orden de llegada y arma
--     2-3 equipos del tamaño que elige. Grupo dinámico (5v5 … 12v12).
--
-- Esta migración SOLO agrega schema (enums + columnas). La lógica (RPCs
-- abrir-cancha / check-in / guardar-armado) va en la migración siguiente, porque
-- un valor de enum recién agregado (convocatoria_modo += 'presentismo') no puede
-- usarse en la misma transacción que lo crea.
-- ============================================================================

-- 1. Cómo confirma un grupo --------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'grupo_modo_confirmacion') then
    create type public.grupo_modo_confirmacion as enum ('convocatoria', 'presentismo');
  end if;
end$$;

alter table public.grupos
  add column if not exists modo_confirmacion public.grupo_modo_confirmacion
    not null default 'convocatoria';

comment on column public.grupos.modo_confirmacion is
  'FUT-114: convocatoria = roster pre-cargado (default). presentismo = check-in en vivo en la cancha, sin roster previo; el coordinador arma 2-3 equipos del tamaño que elige.';

-- 2. Nuevo modo de convocatoria ----------------------------------------------
-- Se agrega el valor acá; se USA recién en la migración de RPCs (otra tx).
do $$
begin
  if not exists (
    select 1
      from pg_enum e
      join pg_type t on e.enumtypid = t.oid
     where t.typname = 'convocatoria_modo'
       and e.enumlabel = 'presentismo'
  ) then
    alter type public.convocatoria_modo add value 'presentismo';
  end if;
end$$;

-- 3. Orden de llegada (check-in) ---------------------------------------------
alter table public.convocatoria_players
  add column if not exists llegada_at timestamptz;

comment on column public.convocatoria_players.llegada_at is
  'FUT-114: timestamp del check-in en modo presentismo (orden de llegada). NULL en convocatorias normales.';

-- 4. Snapshot del armado en cancha -------------------------------------------
-- El plan inicial (2-3 bandos + suplentes) que arma el generador multi-equipo,
-- guardado para re-mostrar/exportar sin recalcular. NO es el team_draft del flujo
-- de 2 equipos A/B (ese sigue intacto y maneja el freeze de la lista, FUT-112).
alter table public.convocatorias
  add column if not exists presentismo_armado jsonb;

comment on column public.convocatorias.presentismo_armado is
  'FUT-114: snapshot del armado en cancha (modo presentismo): {numTeams, teamSize, teams:[{label, goalkeeper, players, bench}], armado_at}. Para mostrar/exportar. Separado de team_draft (flujo A/B).';
