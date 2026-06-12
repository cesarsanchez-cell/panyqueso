-- ============================================================================
-- FUT-112: con el draft generado, el JUGADOR no puede tocar la lista
-- ============================================================================
--
-- Bug de diseño: si después de generar los equipos un titular se bajaba (o se
-- anotaba alguien), la lista cambiaba pero el draft NO, quedando desincronizados
-- (equipos viejos en pantalla y en la imagen de WhatsApp).
--
-- Decisión (usuario): una vez generado el draft, la lista queda CONGELADA. Si
-- hay que cambiarla, el organizador borra el draft, ajusta y regenera. El admin/
-- coordinador maneja eso desde el panel (la UI le esconde los controles de
-- editar la lista cuando hay draft); el JUGADOR no puede bajarse / volver /
-- anotarse mientras los equipos estén armados.
--
-- Lo enforzamos con un trigger sobre convocatoria_players que rechaza cualquier
-- cambio iniciado por un JUGADOR cuando la convocatoria tiene team_draft. Usamos
-- current_player_id(): es NULL para admin/coordinador (no son players), así que
-- el trigger sólo toca los cambios self-service del jugador, no la gestión del
-- panel. Cubre de una sola vez decline / undo / join_open / join_suplente.
--
--   P0071: lista_cerrada_draft (equipos ya armados; el jugador no puede tocar).
-- ============================================================================

create or replace function public.convocatoria_players_freeze_on_draft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv_id uuid := coalesce(new.convocatoria_id, old.convocatoria_id);
begin
  -- Sólo congelamos los cambios iniciados por un JUGADOR. El admin/coordinador
  -- (current_player_id() IS NULL) gestiona desde el panel y debe borrar el draft
  -- primero; no lo bloqueamos acá.
  if public.current_player_id() is null then
    return coalesce(new, old);
  end if;

  if exists (
    select 1
    from public.convocatorias c
    where c.id = v_conv_id
      and c.team_draft is not null
  ) then
    raise exception 'lista_cerrada_draft' using errcode = 'P0071';
  end if;

  return coalesce(new, old);
end;
$$;

comment on function public.convocatoria_players_freeze_on_draft() is
  'FUT-112: con team_draft generado, rechaza cambios del JUGADOR en convocatoria_players (decline/undo/join). current_player_id() NULL = admin/coordinador, no se bloquea. P0071.';

revoke all on function public.convocatoria_players_freeze_on_draft() from public;

drop trigger if exists convocatoria_players_freeze_on_draft on public.convocatoria_players;
create trigger convocatoria_players_freeze_on_draft
  before insert or update or delete on public.convocatoria_players
  for each row
  execute function public.convocatoria_players_freeze_on_draft();
