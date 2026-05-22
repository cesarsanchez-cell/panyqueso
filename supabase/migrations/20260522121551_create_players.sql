-- ============================================================================
-- FUT-16: tabla players
-- ============================================================================
--
-- Plan v4 seccion 2: jugadores del grupo (NO son usuarios del sistema).
-- Todos los campos sensibles (technical/physical/mental/edad/status/
-- role_field/position_pref/rating_confidence) viven aca pero los gobierna
-- player_change_requests + funciones SECURITY DEFINER (FUT-17 a FUT-25).
--
-- Esta migracion solo crea:
--   1. Enums.
--   2. Tabla con CHECKs de dominio (rangos 1-10, edad razonable).
--   3. Trigger inline que calcula internal_score (formula plan v4 seccion 5).
--      Se extraera a una funcion dedicada compute_internal_score en FUT-19.
--   4. RLS habilitado con SOLO policy de SELECT para admin+veedor.
--      INSERT directo BLOQUEADO (no hay policy). Solo
--      apply_player_change_request (FUT-20) podra insertar.
--      UPDATE/DELETE BLOQUEADOS hasta que las issues correspondientes los
--      habiliten controladamente.
-- ============================================================================

-- 1. Enums --------------------------------------------------------------------
create type public.player_status      as enum ('pending', 'approved', 'inactive');
create type public.player_role_field  as enum ('arquero', 'jugador_campo', 'mixto');
create type public.position_pref      as enum ('defensor', 'mediocampista', 'delantero');
create type public.rating_confidence  as enum ('baja', 'media', 'alta');

-- 2. Tabla --------------------------------------------------------------------
create table public.players (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text not null check (length(trim(nombre)) > 0),
  edad                int  not null check (edad between 14 and 99),
  status              public.player_status     not null default 'pending',
  role_field          public.player_role_field not null,
  position_pref       public.position_pref     not null,
  positions_possible  public.position_pref[]   not null default '{}',
  technical           int not null check (technical between 1 and 10),
  physical            int not null check (physical between 1 and 10),
  mental              int not null check (mental between 1 and 10),
  internal_score      numeric not null default 0,
  rating_confidence   public.rating_confidence not null default 'baja',
  private_notes       text,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table  public.players is
  'Jugadores del grupo (no son usuarios del sistema). Campos sensibles modificables solo via player_change_requests + funciones SECURITY DEFINER (FUT-17+).';
comment on column public.players.internal_score is
  'Calculado por trigger. Formula plan v4 seccion 5. Sera extraida a funcion compute_internal_score en FUT-19.';
comment on column public.players.positions_possible is
  'No usado por generador en MVP (plan v4 seccion 5). Editable directo por admin como no-sensible.';

-- 3. Trigger de calculo de internal_score ------------------------------------
-- Mantiene internal_score y updated_at en INSERT y en UPDATE de campos
-- relevantes. La logica de scoring queda inline aca; FUT-19 la migrara a
-- una funcion publica compute_internal_score().
create or replace function public.players_set_internal_score()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  factor_edad numeric;
begin
  -- factor_edad = 1.00 hasta 32 anos, baja 1.5% por anio hasta piso de 0.75.
  factor_edad := case
    when new.edad <= 32 then 1.00
    when new.edad >= 55 then 0.75
    else greatest(0.75, 1.00 - (new.edad - 32)::numeric * 0.015)
  end;

  new.internal_score := round(
      (new.technical::numeric * 0.45)
    + (new.physical::numeric  * factor_edad * 0.30)
    + (new.mental::numeric    * 0.25),
    2
  );
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.players_set_internal_score() from public;

create trigger players_compute_score
  before insert or update of technical, physical, mental, edad
  on public.players
  for each row
  execute function public.players_set_internal_score();

-- 4. RLS ---------------------------------------------------------------------
alter table public.players enable row level security;

-- SELECT: solo admin y veedor. Usa la funcion helper definida en FUT-9.
create policy players_select_admin_veedor
  on public.players
  for select
  to authenticated
  using (public.current_user_role() in ('admin', 'veedor'));

-- NO se crean policies de INSERT/UPDATE/DELETE en este PR.
-- Sin policy, ningun rol authenticated puede operar -> INSERT/UPDATE/DELETE
-- quedan bloqueados para clientes. Solo funciones SECURITY DEFINER (FUT-20+)
-- podran modificar la tabla.
