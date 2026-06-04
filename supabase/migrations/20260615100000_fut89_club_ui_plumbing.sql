-- ============================================================================
-- FUT-89 (Fase 2 · DB): plomería para mostrar y editar el club favorito
-- ============================================================================
--
-- La Fase 1 agregó players.club_id (slug del catálogo estático lib/clubs.ts).
-- Acá lo conectamos a los caminos de lectura/escritura que la UI necesita, sin
-- tocar el flujo de ratings (approve_player_change_request queda intacto):
--
--   1. players_public        -> expone club_id (escudo de los compañeros en
--                               /mi-perfil; vista safe del rol player).
--   2. get_my_player_summary -> devuelve club_id (escudo propio en /mi-perfil).
--   3. get_my_player_full    -> devuelve club_id (prefill del form en /perfil).
--   4. update_my_player_data -> acepta p_club_id (el jugador elige/cambia su
--                               club desde /perfil "Mis datos").
--
-- El club es dato neutro/positivo ("el equipo que ama") y self-owned: no pasa
-- por el veedor. En el alta self-service (links de grupo / invitación) se setea
-- directo con cliente service-role (UI). El alta del admin no lo carga: lo elige
-- el propio jugador. No validamos el slug contra el catálogo en DB (el catálogo
-- vive en código); si llega un slug desconocido, <ClubCrest> simplemente no
-- renderiza nada.
-- ============================================================================

-- 1) players_public: append club_id ------------------------------------------
-- CREATE OR REPLACE VIEW permite agregar columnas al final sin alterar las
-- existentes. El WHERE (control de acceso por rol) queda idéntico.
create or replace view public.players_public as
select
  p.id,
  p.nombre,
  p.fecha_nacimiento,
  p.role_field,
  p.position_pref,
  p.positions_possible,
  p.status,
  p.apodo,
  p.pierna_habil,
  p.avatar_url,
  p.ubicacion_maps_url,
  p.club_id
from public.players p
where
  public.current_user_role() in ('admin', 'veedor')
  or (
    public.current_user_role() = 'player'
    and (
      p.auth_user_id = auth.uid()
      or exists (
        select 1
          from public.grupo_membresias gm_self
          join public.grupo_membresias gm_other
            on gm_self.grupo_id = gm_other.grupo_id
         where gm_self.player_id = public.current_player_id()
           and gm_other.player_id = p.id
           and gm_self.status = 'activo'
           and gm_other.status = 'activo'
      )
    )
  );

comment on view public.players_public is
  'Fase 9 / FUT-89: vista safe de players para el rol player (sin ratings, sin private_notes, sin phone, sin email). Incluye club_id (dato neutro). security_invoker=false: el control de acceso vive en el WHERE.';

-- 2) get_my_player_summary: + club_id ----------------------------------------
drop function if exists public.get_my_player_summary();

create or replace function public.get_my_player_summary()
returns table (
  id         uuid,
  nombre     text,
  status     public.player_status,
  apodo      text,
  avatar_url text,
  club_id    text
)
language sql
security definer
set search_path = ''
stable
as $$
  select p.id, p.nombre, p.status, p.apodo, p.avatar_url, p.club_id
    from public.players p
   where p.auth_user_id = auth.uid()
   limit 1
$$;

comment on function public.get_my_player_summary() is
  'Fase 9 / FUT-75 / FUT-89: datos safe del propio jugador (id/nombre/status/apodo/avatar_url/club_id) para /mi-perfil y /perfil. SECURITY DEFINER porque el rol player no tiene SELECT directo en public.players.';

revoke all on function public.get_my_player_summary() from public;
grant execute on function public.get_my_player_summary() to authenticated;

-- 3) get_my_player_full: + club_id (prefill del form en /perfil) -------------
drop function if exists public.get_my_player_full();

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
  club_id             text,
  status              public.player_status
)
language sql
security definer
set search_path = ''
stable
as $$
  select p.id, p.nombre, p.apodo, p.fecha_nacimiento, p.email, p.phone,
         p.pierna_habil, p.role_field, p.position_pref, p.positions_possible,
         p.ubicacion_maps_url, p.club_id, p.status
    from public.players p
   where p.auth_user_id = auth.uid()
   limit 1
$$;

comment on function public.get_my_player_full() is
  'Fase 9 / FUT-89 Mi cuenta: devuelve los campos editables (y phone read-only) del propio jugador, incluido club_id, para prefillear el form. SECURITY DEFINER porque el rol player no tiene SELECT directo en public.players.';

revoke all on function public.get_my_player_full() from public;
grant execute on function public.get_my_player_full() to authenticated;

-- 4) update_my_player_data: + p_club_id --------------------------------------
-- Cambia la firma -> drop de la firma vieja (9 args) + create de la nueva (10).
drop function if exists public.update_my_player_data(
  text, text, date, text, public.pierna_habil_enum,
  public.player_role_field, public.position_pref, public.position_pref[], text
);

create or replace function public.update_my_player_data(
  p_nombre              text,
  p_apodo               text,
  p_fecha_nacimiento    date,
  p_email               text,
  p_pierna_habil        public.pierna_habil_enum,
  p_role_field          public.player_role_field,
  p_position_pref       public.position_pref,
  p_positions_possible  public.position_pref[],
  p_ubicacion_maps_url  text,
  p_club_id             text
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
  v_club_id     text;
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

  -- club_id: slug del catálogo estático (lib/clubs.ts). NULL = ninguno. No se
  -- valida contra catálogo en DB; solo un límite de longitud defensivo.
  v_club_id := nullif(btrim(p_club_id), '');
  if v_club_id is not null and length(v_club_id) > 40 then
    raise exception 'club_id_invalid' using errcode = 'P0070';
  end if;

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
         ubicacion_maps_url  = v_maps_url,
         club_id             = v_club_id
   where id = v_player_id;
exception
  when unique_violation then
    raise exception 'email_taken' using errcode = 'P0069';
end;
$$;

comment on function public.update_my_player_data is
  'Fase 9 / FUT-89 Mi cuenta: el propio jugador edita sus datos no-rating, incluido club_id. Phone y ratings no se tocan aca. Errores P0060-P0070.';

revoke all on function public.update_my_player_data(
  text, text, date, text, public.pierna_habil_enum,
  public.player_role_field, public.position_pref, public.position_pref[], text, text
) from public;

grant execute on function public.update_my_player_data(
  text, text, date, text, public.pierna_habil_enum,
  public.player_role_field, public.position_pref, public.position_pref[], text, text
) to authenticated;
