-- ============================================================================
-- FUT-111 (Fase 11): el invitado puntual pasa a ser un registro "fantasma"
-- ============================================================================
--
-- El invitado es el "salvavidas" que se llama cuando falta gente: juega ESE
-- partido y nada más. No es un alta (no es miembro, no aparece en la lista de
-- Jugadores, no tiene cuenta). Pero el usuario quiere que PARTICIPE del armado
-- de equipos, del partido confirmado y de los premios (figura/pinocho/carnicero)
-- como uno más.
--
-- El motor de equipos + el partido confirmado están atados a un players.id real
-- (match_team_players.player_id NOT NULL → players). Así que el invitado se
-- modela como una fila players marcada is_guest:
--   - Sin teléfono, sin auth, sin membresía, sin rating por grupo.
--   - internal_score = el puntaje único que pone el admin/coordinador. Le damos
--     una edad neutra (30 → factor de edad 1.0) y técnica=físico=mental=puntaje,
--     así el trigger v2 deja internal_score EXACTO ese número.
--   - Excluido de players_public (no aparece en la vista del jugador). La lista
--     de Jugadores se filtra en la app (no es esta migración).
--
-- El registro NO se borra al terminar el partido (decisión del usuario): jugó,
-- queda en el historial de ese partido. Solo es invisible en las superficies de
-- jugador.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Columna players.is_guest
-- ---------------------------------------------------------------------------
alter table public.players
  add column if not exists is_guest boolean not null default false;

comment on column public.players.is_guest is
  'FUT-111: true = invitado puntual (salvavidas de un partido). Sin cuenta/membresía; participa del partido pero queda fuera de la lista de Jugadores y de players_public.';

-- ---------------------------------------------------------------------------
-- 2. players_public excluye invitados
-- ---------------------------------------------------------------------------
-- Recreamos la vista (versión FUT-89) agregando el filtro is_guest = false al
-- tope del WHERE. Todo lo demás queda idéntico.
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
  p.is_guest = false
  and (
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
    )
  );

comment on view public.players_public is
  'Fase 9 / FUT-89 / FUT-111: vista safe de players para el rol player (sin ratings, sin private_notes, sin phone, sin email). Excluye invitados (is_guest). Incluye club_id. security_invoker=false: el control de acceso vive en el WHERE.';

-- ---------------------------------------------------------------------------
-- 3. RPC agregar_invitado_a_convocatoria
-- ---------------------------------------------------------------------------
-- Crea el registro fantasma + lo suma a la convocatoria, atómico. Gate:
-- can_manage_convocatoria (admin o coordinador del grupo de esa convocatoria).
-- El rol (titular/suplente) se decide por cupo_maximo de la convocatoria, igual
-- que computeRolForNewEntry en la app.
create or replace function public.agregar_invitado_a_convocatoria(
  p_convocatoria_id uuid,
  p_nombre          text,
  p_score           int default 6
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid := auth.uid();
  v_conv       public.convocatorias%rowtype;
  v_nombre     text;
  v_score      int;
  v_player_id  uuid;
  v_titulares  int;
  v_max_orden  int;
  v_rol        public.membresia_tipo;
  v_orden      int;
begin
  if v_actor is null then
    raise exception 'auth_required' using errcode = 'P0001';
  end if;
  if not public.can_manage_convocatoria(p_convocatoria_id) then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;

  v_nombre := nullif(btrim(p_nombre), '');
  if v_nombre is null then
    raise exception 'nombre_required' using errcode = 'P0001';
  end if;
  if length(v_nombre) > 80 then
    raise exception 'nombre_too_long' using errcode = 'P0001';
  end if;

  v_score := coalesce(p_score, 6);
  if v_score < 1 or v_score > 10 then
    raise exception 'score_invalid' using errcode = 'P0001';
  end if;

  -- Lock de la convocatoria. No se puede sumar a una cancelada.
  select * into v_conv from public.convocatorias where id = p_convocatoria_id for update;
  if not found then
    raise exception 'convocatoria_not_found' using errcode = 'P0002';
  end if;
  if v_conv.status = 'cancelada' then
    raise exception 'convocatoria_cancelada' using errcode = 'P0031';
  end if;

  -- Registro fantasma. edad neutra=30 → age_physical_factor=1.0, así
  -- internal_score (v2) sale EXACTO = puntaje. Sin teléfono/auth/membresía.
  insert into public.players (
    nombre, edad, is_guest, role_field, position_pref, positions_possible,
    technical, physical, mental, rating_confidence, status, created_by
  )
  values (
    v_nombre, 30, true, 'jugador_campo', 'mediocampista',
    array['mediocampista']::public.position_pref[],
    v_score, v_score, v_score, 'baja', 'approved', v_actor
  )
  returning id into v_player_id;

  -- Rol por cupo (titular si hay vacante según cupo_maximo; si no, suplente al
  -- final de la cola). Idéntico a computeRolForNewEntry.
  select count(*) into v_titulares
  from public.convocatoria_players
  where convocatoria_id = p_convocatoria_id
    and rol_en_convocatoria = 'titular'
    and attendance_status <> 'declinado';

  if v_titulares < v_conv.cupo_maximo then
    v_rol := 'titular';
    v_orden := null;
  else
    select coalesce(max(orden_suplente), 0) into v_max_orden
    from public.convocatoria_players
    where convocatoria_id = p_convocatoria_id
      and rol_en_convocatoria = 'suplente'
      and attendance_status <> 'declinado';
    v_rol := 'suplente';
    v_orden := v_max_orden + 1;
  end if;

  -- nombre_libre = NULL: el CHECK exige exactamente uno de player_id/nombre_libre,
  -- y acá el invitado YA tiene player_id (el fantasma). El nombre se muestra
  -- desde players.nombre.
  insert into public.convocatoria_players (
    convocatoria_id, player_id, nombre_libre,
    rol_en_convocatoria, orden_suplente, attendance_status
  )
  values (
    p_convocatoria_id, v_player_id, null,
    v_rol, v_orden, 'confirmado'
  );

  insert into public.audit_log (actor_id, entity, entity_id, action, payload)
  values (
    v_actor, 'players', v_player_id, 'agregar_invitado',
    jsonb_build_object('convocatoria_id', p_convocatoria_id, 'score', v_score, 'rol', v_rol)
  );

  return jsonb_build_object('player_id', v_player_id, 'rol', v_rol);
end;
$$;

comment on function public.agregar_invitado_a_convocatoria(uuid, text, int) is
  'FUT-111: crea un invitado puntual (players.is_guest, internal_score = puntaje) y lo suma a la convocatoria (rol por cupo). Gate can_manage_convocatoria. Audita.';

revoke all on function public.agregar_invitado_a_convocatoria(uuid, text, int) from public, anon;
grant execute on function public.agregar_invitado_a_convocatoria(uuid, text, int) to authenticated;
