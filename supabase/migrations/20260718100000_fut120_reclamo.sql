-- ============================================================================
-- FUT-120 (Fase 13 / F2): auto-reclamo del teléfono ya existente
-- ============================================================================
--
-- Hoy, si alguien abre el link /g con un teléfono que YA existe (jugador creado
-- a mano o de otro grupo), el alta corta con error. Esto lo cambia: en vez de
-- error, crea una SOLICITUD DE RECLAMO que el admin confirma ("¿es esta
-- persona?"). El reclamo NO crea login ni toca el jugador existente (evita robo
-- de identidad). Va SIEMPRE a confirmación del admin, sin importar el toggle de
-- aprobación del grupo (decisión 2b).
--
-- Al confirmar, aprobar_join_request (FUT-119) ya sirve para los dos casos:
-- crea la membresía por cupo (el trigger seed_group_rating hereda el rating) y
-- deja el jugador approved.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. kind: distingue alta nueva de reclamo
-- ---------------------------------------------------------------------------
alter table public.grupo_join_requests
  add column if not exists kind text not null default 'nuevo';

alter table public.grupo_join_requests
  drop constraint if exists grupo_join_requests_kind_chk;
alter table public.grupo_join_requests
  add constraint grupo_join_requests_kind_chk check (kind in ('nuevo', 'reclamo'));

comment on column public.grupo_join_requests.kind is
  'FUT-120: nuevo = alta self-service (jugador pending creado por el link); reclamo = el teléfono ya existía y el admin confirma que es esa persona.';

-- ---------------------------------------------------------------------------
-- 2. solicitar_reclamo_por_link: crea el reclamo (sin tocar el jugador)
-- ---------------------------------------------------------------------------
-- Devuelve un texto de estado: 'creado' | 'ya_miembro' | 'ya_pendiente'.
-- Se llama desde el server action de /g (token = capability). No crea auth.
create or replace function public.solicitar_reclamo_por_link(
  p_token text,
  p_phone text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grupo  public.grupos%rowtype;
  v_player public.players%rowtype;
begin
  select * into v_grupo from public.grupos where join_token = p_token for share;
  if not found then
    raise exception 'join_token_not_found' using errcode = 'P0030';
  end if;
  if v_grupo.status <> 'activo' then
    raise exception 'grupo_archived' using errcode = 'P0031';
  end if;

  select * into v_player from public.players where phone = p_phone;
  if not found then
    raise exception 'player_not_found' using errcode = 'P0033';
  end if;

  -- Ya es miembro activo → no hay nada que reclamar.
  if exists (
    select 1 from public.grupo_membresias
     where grupo_id = v_grupo.id and player_id = v_player.id and status = 'activo'
  ) then
    return 'ya_miembro';
  end if;

  -- Ya hay una solicitud pendiente (alta o reclamo) para esta persona en el grupo.
  if exists (
    select 1 from public.grupo_join_requests
     where grupo_id = v_grupo.id and player_id = v_player.id and status = 'pendiente'
  ) then
    return 'ya_pendiente';
  end if;

  insert into public.grupo_join_requests (grupo_id, player_id, kind)
  values (v_grupo.id, v_player.id, 'reclamo');
  return 'creado';
end;
$$;

revoke all on function public.solicitar_reclamo_por_link(text, text) from public;
grant execute on function public.solicitar_reclamo_por_link(text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. listar_join_requests: agrega kind + si el jugador ya tiene login
-- ---------------------------------------------------------------------------
-- Cambia el tipo de retorno → drop + create.
drop function if exists public.listar_join_requests(uuid);

create or replace function public.listar_join_requests(p_grupo_id uuid)
returns table (
  request_id  uuid,
  player_id   uuid,
  nombre      text,
  phone       text,
  kind        text,
  tiene_login boolean,
  created_at  timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if not coalesce(public.can_manage_grupo(p_grupo_id), false) then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;

  return query
  select r.id, p.id, p.nombre, p.phone, r.kind, (p.auth_user_id is not null), r.created_at
    from public.grupo_join_requests r
    join public.players p on p.id = r.player_id
   where r.grupo_id = p_grupo_id
     and r.status = 'pendiente'
   order by r.created_at asc;
end;
$$;

revoke all on function public.listar_join_requests(uuid) from public, anon;
grant execute on function public.listar_join_requests(uuid) to authenticated;
