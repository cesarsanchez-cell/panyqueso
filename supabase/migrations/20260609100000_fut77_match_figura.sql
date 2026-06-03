-- ============================================================================
-- FUT-77: Figura del partido (la asigna el admin)
-- ============================================================================
--
-- Incentivo positivo. Un jugador por partido puede marcarse como "figura". La
-- decision es del ADMIN al cargar el resultado (simple, sin conflicto; la
-- friccion vive en el admin). La votacion de jugadores queda como evolucion
-- futura. Es la primera pieza del modulo de stats completo.
--
-- (1) matches.figura_player_id: puntero suave (nullable) al jugador figura.
--     on delete set null: la figura es opcional y no debe bloquear; igual los
--     players no se borran (las bajas pasan por player_change_request). A
--     diferencia de match_team_players (on delete restrict, que preserva quien
--     jugo), aca solo guardamos un highlight, asi que set null alcanza.
-- (2) Trigger figura_en_roster: si figura_player_id no es null, el jugador
--     tiene que haber jugado el partido (estar en algun match_team del match).
--     Un CHECK no puede hacer subqueries; mismo estilo que el trigger
--     match_team_players_no_duplicate_in_match.
--
-- La escritura la hace el admin via UPDATE directo (la RLS de matches ya es
-- INSERT/UPDATE admin-only, mismo patron que goles y video); no hace falta un
-- RPC SECURITY DEFINER nuevo para asignarla.
-- ============================================================================

alter table public.matches
  add column figura_player_id uuid
    references public.players(id) on delete set null;

comment on column public.matches.figura_player_id is
  'FUT-77: jugador elegido figura del partido. Lo asigna el admin. Nullable. Visible al jugador (dato positivo/neutral).';

create index matches_figura_player_idx on public.matches (figura_player_id);

-- ----------------------------------------------------------------------------
-- Trigger: la figura tiene que haber jugado el partido.
-- ----------------------------------------------------------------------------
create or replace function public.matches_figura_en_roster()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_count int;
begin
  if new.figura_player_id is null then
    return new;
  end if;

  select count(*) into v_count
  from public.match_team_players mtp
  join public.match_teams mt on mt.id = mtp.match_team_id
  where mt.match_id = new.id
    and mtp.player_id = new.figura_player_id;

  if v_count = 0 then
    raise exception 'figura_no_jugo_el_partido'
      using errcode = 'P0042', detail = new.figura_player_id::text;
  end if;

  return new;
end;
$$;

comment on function public.matches_figura_en_roster() is
  'FUT-77: impide marcar como figura a un jugador que no jugo el partido. P0042 si el player no esta en ningun match_team del match.';

revoke all on function public.matches_figura_en_roster() from public;

create trigger matches_figura_en_roster
  before insert or update of figura_player_id on public.matches
  for each row
  execute function public.matches_figura_en_roster();
