-- ============================================================================
-- FUT-116 (Fase 12 / A4): confirmar la sesión presentismo → crea el partido
-- ============================================================================
--
-- "Confirmar sesión" registra el partido para que CUENTE: participación en
-- historial + premios votados (figura/carnicero). Crea, atómico:
--   - 1 matches (winner NULL: la rotación no tiene un resultado único; el
--     historial lo muestra como 'sin_resultado' y NO hay Prode).
--   - 1 match_teams por bando del armado (A/B/C).
--   - 1 match_team_players por CADA presente del armado (titulares + arquero +
--     suplentes): todos jugaron/rotaron, así que todos son participantes y
--     pueden votar/ser votados en los premios.
-- Y cierra la convocatoria (status='cerrada').
--
-- Toda la lógica de premios e historial queda intacta (ya tolera winner NULL y
-- label 'C'). Gate: can_manage_convocatoria.
--
-- Códigos de error:
--   P0082: la sesión no tiene equipos armados todavía.
--   P0083: la sesión ya fue confirmada (ya existe el partido).
-- ============================================================================

create or replace function public.confirmar_sesion_presentismo(p_convocatoria_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv     public.convocatorias%rowtype;
  v_armado   jsonb;
  v_match_id uuid;
  v_team     jsonb;
  v_team_id  uuid;
  v_player   jsonb;
begin
  if not public.can_manage_convocatoria(p_convocatoria_id) then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;

  select * into v_conv from public.convocatorias where id = p_convocatoria_id for update;
  if not found then
    raise exception 'convocatoria_not_found' using errcode = 'P0053';
  end if;
  if v_conv.modo <> 'presentismo' then
    raise exception 'convocatoria_no_presentismo' using errcode = 'P0080';
  end if;
  if v_conv.status <> 'abierta' then
    raise exception 'convocatoria_not_open' using errcode = 'P0057', detail = v_conv.status::text;
  end if;

  v_armado := v_conv.presentismo_armado;
  if v_armado is null
     or jsonb_typeof(v_armado -> 'teams') <> 'array'
     or jsonb_array_length(v_armado -> 'teams') = 0 then
    raise exception 'sin_armado' using errcode = 'P0082';
  end if;

  if exists (select 1 from public.matches where convocatoria_id = p_convocatoria_id) then
    raise exception 'ya_confirmada' using errcode = 'P0083';
  end if;

  -- matches: winner NULL (sin resultado único). balance_snapshot = el armado.
  insert into public.matches (
    convocatoria_id, fecha, algorithm_version, balance_snapshot, confirmed_by, confirmed_at
  )
  values (
    p_convocatoria_id, v_conv.fecha, 'presentismo-v1', v_armado, auth.uid(), now()
  )
  returning id into v_match_id;

  -- Un match_teams por bando + sus participantes (arquero + titulares + banco).
  for v_team in select * from jsonb_array_elements(v_armado -> 'teams')
  loop
    insert into public.match_teams (match_id, team_label)
      values (v_match_id, (v_team ->> 'label')::public.match_team_label)
      returning id into v_team_id;

    if v_team -> 'goalkeeper' is not null and jsonb_typeof(v_team -> 'goalkeeper') = 'object' then
      insert into public.match_team_players (match_team_id, player_id, is_goalkeeper)
        values (v_team_id, (v_team -> 'goalkeeper' ->> 'id')::uuid, true);
    end if;

    for v_player in select * from jsonb_array_elements(coalesce(v_team -> 'players', '[]'::jsonb))
    loop
      insert into public.match_team_players (match_team_id, player_id, is_goalkeeper)
        values (v_team_id, (v_player ->> 'id')::uuid, false);
    end loop;

    for v_player in select * from jsonb_array_elements(coalesce(v_team -> 'bench', '[]'::jsonb))
    loop
      insert into public.match_team_players (match_team_id, player_id, is_goalkeeper)
        values (v_team_id, (v_player ->> 'id')::uuid, false);
    end loop;
  end loop;

  -- Cerrar la sesión (cierre_at sigue NULL → el cron no la toca).
  update public.convocatorias
     set status = 'cerrada', updated_at = now()
   where id = p_convocatoria_id;

  return v_match_id;
end;
$$;

comment on function public.confirmar_sesion_presentismo(uuid) is
  'FUT-116: confirma una sesión presentismo creando el partido (matches winner NULL + match_teams A/B/C + match_team_players de todos los presentes) y cerrando la convocatoria. Habilita premios e historial-participación. Gate can_manage_convocatoria.';

revoke all on function public.confirmar_sesion_presentismo(uuid) from public, anon;
grant execute on function public.confirmar_sesion_presentismo(uuid) to authenticated;
