-- ============================================================================
-- Acceso unificado por link: activar a un jugador EXISTENTE no activado
-- ============================================================================
--
-- Contexto (opción 3, interino): el link general /g/<token> es la única puerta.
-- Pide el celular y ramifica:
--   - 'nuevo'   → el celular no está en la base → alta nueva (claim_group_join).
--   - 'activar' → el celular existe pero la cuenta NUNCA se activó (sin login, o
--                 sin cuenta) → el jugador setea su clave y entra, CONSERVANDO su
--                 ficha/partidos/historial.
--   - 'login'   → el celular existe y la cuenta YA se usó (last_sign_in_at) → va a
--                 /login (a esa cuenta no la pisa nadie por el link).
--
-- "Nunca se activó" es del lado del AUTH (auth.users.last_sign_in_at IS NULL), no
-- de la actividad del jugador: un jugador puede tener muchos partidos cargados por
-- el admin y jamás haberse logueado.
--
-- CANDADO (interino): el camino 'activar' saltea el reclamo/confirmación del admin
-- SOLO para cuentas nunca activadas; las activas quedan protegidas. Es confianza
-- para la beta de un grupo conocido. Cuando se abra a gente de afuera, este camino
-- se protege con OTP SMS (FUT-121).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. lookup_join_phone_state: ¿qué camino sigue este celular?
-- ---------------------------------------------------------------------------
-- Devuelve estado ('nuevo' | 'activar' | 'login'), el nombre (para saludar en
-- 'activar'/'login') y el player_id. Lee auth.users.last_sign_in_at (puede
-- porque corre como definer). anon: se llama antes del login, desde /g.
create or replace function public.lookup_join_phone_state(
  p_token text,
  p_phone text
)
returns table (estado text, nombre text, player_id uuid)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_grupo        public.grupos%rowtype;
  v_player       public.players%rowtype;
  v_last_sign_in timestamptz;
begin
  select * into v_grupo from public.grupos where join_token = p_token;
  if not found or v_grupo.status <> 'activo' then
    raise exception 'join_token_not_found' using errcode = 'P0030';
  end if;

  select * into v_player from public.players where phone = p_phone;
  if not found then
    return query select 'nuevo'::text, null::text, null::uuid;
    return;
  end if;

  -- ¿La cuenta ya se usó alguna vez?
  if v_player.auth_user_id is not null then
    select u.last_sign_in_at into v_last_sign_in
      from auth.users u where u.id = v_player.auth_user_id;
    if v_last_sign_in is not null then
      return query select 'login'::text, v_player.nombre, v_player.id;
      return;
    end if;
  end if;

  -- Existe pero nunca se activó (sin cuenta, o cuenta sin login).
  return query select 'activar'::text, v_player.nombre, v_player.id;
end;
$$;

comment on function public.lookup_join_phone_state(text, text) is
  'Acceso por link: dado el token del grupo y un celular, devuelve el camino (nuevo|activar|login). "activar" = ficha existente cuya cuenta nunca se logueó (auth.last_sign_in_at null).';

revoke all on function public.lookup_join_phone_state(text, text) from public;
grant execute on function public.lookup_join_phone_state(text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. activar_jugador_existente: vincula login + asegura membresía
-- ---------------------------------------------------------------------------
-- La crea/actualiza la cuenta de auth (password) la hace el server action con el
-- admin client; esta función SOLO vincula la ficha existente a esa cuenta, le
-- pone rol player y le asegura una membresía activa por cupo. NO toca status,
-- ratings ni datos del jugador (se conserva todo su historial).
--
-- service_role-only: la invoca el server action de /g (que ya validó, leyendo
-- last_sign_in_at, que la cuenta nunca se activó). No es invocable por clientes.
create or replace function public.activar_jugador_existente(
  p_token        text,
  p_player_id    uuid,
  p_auth_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grupo           public.grupos%rowtype;
  v_player          public.players%rowtype;
  v_titulares_count int;
  v_max_suplente    int;
  v_tipo            public.membresia_tipo;
  v_orden           int;
begin
  select * into v_grupo from public.grupos where join_token = p_token for update;
  if not found then
    raise exception 'join_token_not_found' using errcode = 'P0030';
  end if;
  if v_grupo.status <> 'activo' then
    raise exception 'grupo_archived' using errcode = 'P0031';
  end if;

  select * into v_player from public.players where id = p_player_id for update;
  if not found then
    raise exception 'player_not_found' using errcode = 'P0033';
  end if;

  -- Defensa: no robar una ficha que YA está vinculada a otra cuenta.
  if v_player.auth_user_id is not null and v_player.auth_user_id <> p_auth_user_id then
    raise exception 'player_ya_vinculado' using errcode = 'P0091';
  end if;

  -- Profile (el trigger on_auth_user_created ya lo creó): rol player + nombre.
  insert into public.profiles (id, nombre, role)
  values (p_auth_user_id, v_player.nombre, 'player')
  on conflict (id) do update
    set role   = 'player',
        nombre = excluded.nombre;

  -- Vincular ficha <-> cuenta (auth_user_id no es campo inmutable/sensible).
  update public.players
     set auth_user_id = p_auth_user_id
   where id = p_player_id;

  -- Asegurar membresía activa en ESTE grupo (por cupo) si no la tiene.
  if not exists (
    select 1 from public.grupo_membresias
     where grupo_id = v_grupo.id and player_id = p_player_id and status = 'activo'
  ) then
    select count(*) into v_titulares_count
      from public.grupo_membresias
     where grupo_id = v_grupo.id and tipo = 'titular' and status = 'activo';

    if v_titulares_count < v_grupo.cupo_titulares then
      v_tipo := 'titular';
      v_orden := null;
    else
      select coalesce(max(orden), 0) into v_max_suplente
        from public.grupo_membresias
       where grupo_id = v_grupo.id and tipo = 'suplente' and status = 'activo';
      v_tipo := 'suplente';
      v_orden := v_max_suplente + 1;
    end if;

    insert into public.grupo_membresias (grupo_id, player_id, tipo, orden, status)
    values (v_grupo.id, p_player_id, v_tipo, v_orden, 'activo')
    on conflict do nothing;
  end if;
end;
$$;

comment on function public.activar_jugador_existente(text, uuid, uuid) is
  'Acceso por link (camino activar): vincula una ficha existente NO activada a su cuenta de auth (rol player) y le asegura membresía por cupo. No toca status/ratings/datos. service_role-only: lo invoca el server action que ya verificó que la cuenta nunca se logueó.';

revoke all on function public.activar_jugador_existente(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.activar_jugador_existente(text, uuid, uuid) to service_role;
