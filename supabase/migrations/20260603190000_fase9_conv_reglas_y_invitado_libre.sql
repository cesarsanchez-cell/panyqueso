-- ============================================================================
-- Fase 9 follow-up: reglas de convocatoria + invitado libre + maps en lugares
-- ============================================================================
--
-- 1) lugares.ubicacion_maps_url: agrego URL de Google Maps al catalogo.
--
-- 2) convocatorias unicidad: un grupo NO puede tener dos convocatorias para
--    la misma fecha simultaneamente. Excepcion: las canceladas no cuentan
--    (se permite cancelar y rehacer en la misma fecha).
--
-- 3) convocatoria_players "invitado libre": un admin puede agregar a una
--    convocatoria cerrada/jugada un participante eventual que no es un
--    player del catalogo (ej: amigo de un titular que vino a tapar un
--    faltazo). Lo modelamos relajando player_id a nullable y agregando
--    nombre_libre. Exactamente uno de los dos debe estar seteado.
--    Ajustamos el trigger validate_player para que se saltee filas con
--    player_id NULL.
--
-- 4) Note: el bloqueo de decline/undo en convs no abiertas y la
--    validacion de fecha futura viven en la migracion de logica que sigue.
-- ============================================================================

-- 1) Maps URL en lugares.
alter table public.lugares
  add column ubicacion_maps_url text;

comment on column public.lugares.ubicacion_maps_url is
  'Fase 9 follow-up: URL de Google Maps al lugar (la usa el jugador para llegar).';

-- 2) Unique parcial sobre convocatorias.
create unique index convocatorias_grupo_fecha_unique
  on public.convocatorias (grupo_id, fecha)
  where status <> 'cancelada' and grupo_id is not null;

comment on index public.convocatorias_grupo_fecha_unique is
  'Fase 9 follow-up: un grupo no puede tener dos convocatorias para la misma fecha salvo que una este cancelada.';

-- 3) Invitado libre.
alter table public.convocatoria_players
  alter column player_id drop not null;

alter table public.convocatoria_players
  add column nombre_libre text;

alter table public.convocatoria_players
  add constraint convocatoria_players_player_o_libre
  check (
    (player_id is not null and nombre_libre is null)
    or
    (player_id is null and nombre_libre is not null and length(trim(nombre_libre)) > 0)
  );

comment on column public.convocatoria_players.nombre_libre is
  'Fase 9 follow-up: nombre tipeado a mano cuando se invita a alguien que no es player del catalogo. Solo seteado cuando player_id IS NULL. Casos: emergencias post-cierre donde un amigo cubre a un titular.';

-- Trigger validate_player debe saltar cuando es invitado libre.
create or replace function public.convocatoria_players_validate_player()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status public.player_status;
begin
  if new.player_id is null then
    -- Invitado libre, no hay player que validar.
    return new;
  end if;

  select status into v_status
  from public.players
  where id = new.player_id;

  if v_status is null then
    raise exception 'player_not_found'
      using errcode = 'P0030';
  end if;

  if v_status <> 'approved' then
    raise exception 'player_not_approved'
      using errcode = 'P0031', detail = v_status::text;
  end if;

  return new;
end;
$$;

comment on function public.convocatoria_players_validate_player() is
  'Rechaza INSERT en convocatoria_players si el player no esta approved. Se saltea cuando player_id IS NULL (invitado libre).';
