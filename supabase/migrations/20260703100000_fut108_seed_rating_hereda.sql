-- ============================================================================
-- FUT-108 (Fase 11, 2c-3a): el seed del rating por grupo HEREDA del más reciente
-- ============================================================================
--
-- Hasta ahora, al sumar a un jugador a un grupo (grupo_membresias_seed_rating,
-- FUT-103) la fila de player_group_ratings se copiaba SIEMPRE de la base global
-- del jugador. Decisión del usuario (2c-3): si el jugador YA tiene rating en otro
-- grupo, el grupo nuevo HEREDA del rating de grupo MÁS RECIENTE (la evaluación
-- más actual); si no tiene ninguno, cae a la base (comportamiento original).
--
-- Aplica a TODA alta de membresía (admin o coordinador). El coordinador del grupo
-- nuevo después conserva o modifica (el editor de rating por grupo ya existe).
--
-- Las dimensiones (técnica/físico/mental) y el internal_score los deriva el
-- trigger BEFORE player_group_ratings_set_score a partir de los 9 subs + la edad
-- global, así que con copiar los 9 subs alcanza para reproducir el score.
-- on conflict do nothing: re-ingresar al grupo CONSERVA el rating afinado.
-- ============================================================================

create or replace function public.grupo_membresias_seed_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src public.player_group_ratings;
begin
  -- ¿El jugador ya tiene rating en algún grupo? Tomamos el MÁS RECIENTE.
  select pgr.* into v_src
    from public.player_group_ratings pgr
   where pgr.player_id = new.player_id
   order by pgr.updated_at desc
   limit 1;

  if v_src.player_id is not null then
    -- Heredar del rating de grupo más reciente.
    insert into public.player_group_ratings (
      player_id, grupo_id,
      phys_power, phys_speed, phys_stamina,
      ment_tactical, ment_resilience, ment_attitude,
      tech_passing, tech_finishing, tech_linkup,
      role_field, position_pref, positions_possible, rating_confidence
    )
    values (
      new.player_id, new.grupo_id,
      v_src.phys_power, v_src.phys_speed, v_src.phys_stamina,
      v_src.ment_tactical, v_src.ment_resilience, v_src.ment_attitude,
      v_src.tech_passing, v_src.tech_finishing, v_src.tech_linkup,
      v_src.role_field, v_src.position_pref, v_src.positions_possible, v_src.rating_confidence
    )
    on conflict (player_id, grupo_id) do nothing;
  else
    -- Sin rating de grupo previo: copiar de la base (comportamiento original).
    insert into public.player_group_ratings (
      player_id, grupo_id,
      phys_power, phys_speed, phys_stamina,
      ment_tactical, ment_resilience, ment_attitude,
      tech_passing, tech_finishing, tech_linkup,
      role_field, position_pref, positions_possible, rating_confidence
    )
    select p.id, new.grupo_id,
      coalesce(p.phys_power,      p.physical),  coalesce(p.phys_speed,      p.physical),  coalesce(p.phys_stamina,   p.physical),
      coalesce(p.ment_tactical,   p.mental),    coalesce(p.ment_resilience, p.mental),    coalesce(p.ment_attitude,  p.mental),
      coalesce(p.tech_passing,    p.technical), coalesce(p.tech_finishing,  p.technical), coalesce(p.tech_linkup,    p.technical),
      p.role_field, p.position_pref, p.positions_possible, p.rating_confidence
      from public.players p
     where p.id = new.player_id
    on conflict (player_id, grupo_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.grupo_membresias_seed_rating() from public;
