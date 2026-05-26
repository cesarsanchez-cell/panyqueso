-- ============================================================================
-- Fase 9 follow-up: RPCs para "Mi cuenta" (player edita sus propios datos)
-- ============================================================================
--
-- El rol player no tiene SELECT ni UPDATE directos sobre public.players. Los
-- datos publicos pasan por la view players_public; el resumen propio por
-- get_my_player_summary. Para que el jugador pueda ver y editar sus datos
-- no-rating en /perfil, agregamos dos RPCs SECURITY DEFINER autodescubiertos
-- por auth.uid().
--
-- Campos editables por el jugador (alcance Fase 9 PR Mi cuenta):
--   nombre, apodo, fecha_nacimiento (+ edad derivada), email, pierna_habil,
--   role_field, position_pref, positions_possible, ubicacion_maps_url.
--
-- Campos NO editables aca:
--   phone        -> clave de identidad (1 cel = 1 jugador), solo admin
--   ratings      -> technical/physical/mental/rating_confidence via veedor
--   status       -> admin
--   private_notes-> admin/veedor
--   internal_score, identidad -> inmutables
--   avatar_url   -> no hay upload UI todavia
--
-- ============================================================================

-- 1) get_my_player_full: devuelve los campos editables del jugador logueado
--    para prefillear el form. Solo el jugador mismo (auth_user_id = auth.uid()).
-- ============================================================================

create or replace function public.get_my_player_full()
returns table (
  id                  uuid,
  nombre              text,
  apodo               text,
  fecha_nacimiento    date,
  email               text,
  phone               text,
  pierna_habil        public.pierna_habil_enum,
  role_field          public.player_role_field,
  position_pref       public.position_pref,
  positions_possible  public.position_pref[],
  ubicacion_maps_url  text,
  status              public.player_status
)
language sql
security definer
set search_path = ''
stable
as $$
  select p.id, p.nombre, p.apodo, p.fecha_nacimiento, p.email, p.phone,
         p.pierna_habil, p.role_field, p.position_pref, p.positions_possible,
         p.ubicacion_maps_url, p.status
    from public.players p
   where p.auth_user_id = auth.uid()
   limit 1
$$;

comment on function public.get_my_player_full() is
  'Fase 9 Mi cuenta: devuelve todos los campos editables (y phone read-only) del propio jugador para prefillear el form. SECURITY DEFINER porque el rol player no tiene SELECT directo en public.players.';

revoke all on function public.get_my_player_full() from public;
grant execute on function public.get_my_player_full() to authenticated;

-- 2) update_my_player_data: el jugador edita sus datos no-rating. Recibe
--    todos los campos editables. Recalcula edad desde fecha_nacimiento.
--    Errores con codes propios para mapear en la UI.
-- ============================================================================

create or replace function public.update_my_player_data(
  p_nombre              text,
  p_apodo               text,
  p_fecha_nacimiento    date,
  p_email               text,
  p_pierna_habil        public.pierna_habil_enum,
  p_role_field          public.player_role_field,
  p_position_pref       public.position_pref,
  p_positions_possible  public.position_pref[],
  p_ubicacion_maps_url  text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id   uuid;
  v_edad        int;
  v_nombre      text;
  v_apodo       text;
  v_email       text;
  v_maps_url    text;
  v_positions   public.position_pref[];
begin
  -- 1) Resolver player desde la sesion.
  select id into v_player_id
    from public.players
   where auth_user_id = auth.uid()
   limit 1;

  if v_player_id is null then
    raise exception 'not_a_player' using errcode = 'P0040';
  end if;

  -- 2) Validaciones de dominio.

  v_nombre := nullif(btrim(p_nombre), '');
  if v_nombre is null then
    raise exception 'nombre_required' using errcode = 'P0060';
  end if;
  if length(v_nombre) > 80 then
    raise exception 'nombre_too_long' using errcode = 'P0061';
  end if;

  if p_fecha_nacimiento is null then
    raise exception 'fecha_nacimiento_required' using errcode = 'P0062';
  end if;
  v_edad := extract(year from age(current_date, p_fecha_nacimiento))::int;
  if v_edad < 14 or v_edad > 99 then
    raise exception 'fecha_nacimiento_out_of_range' using errcode = 'P0063';
  end if;

  v_apodo := nullif(btrim(p_apodo), '');
  if v_apodo is not null and length(v_apodo) > 40 then
    raise exception 'apodo_too_long' using errcode = 'P0064';
  end if;

  v_email := nullif(lower(btrim(p_email)), '');
  if v_email is not null then
    if length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'email_invalid' using errcode = 'P0065';
    end if;
  end if;

  v_maps_url := nullif(btrim(p_ubicacion_maps_url), '');
  if v_maps_url is not null then
    if length(v_maps_url) > 500 or v_maps_url !~* '^https?://' then
      raise exception 'maps_url_invalid' using errcode = 'P0066';
    end if;
  end if;

  if p_role_field is null then
    raise exception 'role_field_required' using errcode = 'P0067';
  end if;
  if p_position_pref is null then
    raise exception 'position_pref_required' using errcode = 'P0068';
  end if;

  v_positions := coalesce(p_positions_possible, '{}'::public.position_pref[]);

  -- 3) UPDATE. El trigger players_enforce_immutability ya bloquea ratings
  --    y derivados; los GRANTs no aplican porque corremos como definer.
  update public.players
     set nombre              = v_nombre,
         apodo               = v_apodo,
         fecha_nacimiento    = p_fecha_nacimiento,
         edad                = v_edad,
         email               = v_email,
         pierna_habil        = p_pierna_habil,
         role_field          = p_role_field,
         position_pref       = p_position_pref,
         positions_possible  = v_positions,
         ubicacion_maps_url  = v_maps_url
   where id = v_player_id;
exception
  when unique_violation then
    -- email es el unico campo con UNIQUE en este set.
    raise exception 'email_taken' using errcode = 'P0069';
end;
$$;

comment on function public.update_my_player_data is
  'Fase 9 Mi cuenta: el propio jugador edita sus datos no-rating (nombre, apodo, fecha_nac, email, pierna, role, position, positions, maps). Phone y ratings no se tocan aca. Errores P0060-P0069.';

revoke all on function public.update_my_player_data(
  text, text, date, text, public.pierna_habil_enum,
  public.player_role_field, public.position_pref, public.position_pref[], text
) from public;

grant execute on function public.update_my_player_data(
  text, text, date, text, public.pierna_habil_enum,
  public.player_role_field, public.position_pref, public.position_pref[], text
) to authenticated;
