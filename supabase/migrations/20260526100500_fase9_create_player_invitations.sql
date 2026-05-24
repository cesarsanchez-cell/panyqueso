-- ============================================================================
-- Fase 9 PR 1: tabla player_invitations
-- ============================================================================
--
-- Cada row representa una invitacion individual que el admin manda al
-- telefono de un jugador (manualmente via WA). Los datos del invitado
-- viven aca hasta que acepta (en ese momento se crea el row en players).
--
-- Estado derivado en queries:
--   pending:  used_at IS NULL AND declined_at IS NULL AND expires_at > now()
--   accepted: used_at IS NOT NULL
--   declined: declined_at IS NOT NULL
--   expired:  used_at IS NULL AND declined_at IS NULL AND expires_at <= now()
--
-- expires_at se calcula al crear el invite: min(partido - 8h, cuando el
-- cupo se llene). El cierre por cupo lleno requiere logica adicional que va
-- en PR 6 (server action de createInvitation). En PR 1 solo guardamos el
-- valor crudo y dejamos preparado el esquema.
--
-- RLS especial: anon puede SELECT por token. Esto convierte al token en una
-- "capability": cualquiera con el link puede ver los datos del invite. La
-- ruta publica /invite/<token> usa el anon key y filtra por token exacto.
-- ============================================================================

create table public.player_invitations (
  id                  uuid primary key default gen_random_uuid(),
  token               text not null unique check (length(token) >= 16),
  phone               text not null check (length(trim(phone)) > 0),
  nombre_tentativo    text,
  grupo_id            uuid not null references public.grupos(id) on delete cascade,
  convocatoria_id     uuid references public.convocatorias(id) on delete set null,
  created_by          uuid not null references public.profiles(id) on delete restrict,
  created_at          timestamptz not null default now(),
  used_at             timestamptz,
  used_by_player_id   uuid references public.players(id) on delete set null,
  declined_at         timestamptz,
  expires_at          timestamptz not null,

  -- No puede estar usado y declinado a la vez.
  check (used_at is null or declined_at is null)
);

comment on table public.player_invitations is
  'Fase 9: invitaciones que el admin manda al telefono de un jugador. El token actua como capability para acceder a /invite/<token> sin login.';
comment on column public.player_invitations.token is
  'URL-safe string. Generado en server action al crear. Funciona como capability: quien tenga el link, accede al invite.';
comment on column public.player_invitations.expires_at is
  'Min entre (fecha+hora del partido - 8h) y el momento en que el cupo se llena. Calculo final en server action (PR 6).';

-- Indices: tokens de busqueda rapida, lookup por grupo y por phone.
create index player_invitations_grupo_idx
  on public.player_invitations (grupo_id);
create index player_invitations_phone_idx
  on public.player_invitations (phone);
create index player_invitations_pending_idx
  on public.player_invitations (grupo_id)
  where used_at is null and declined_at is null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.player_invitations enable row level security;

-- 1. authenticated (admin/veedor): SELECT todas las invitaciones.
create policy player_invitations_select_admin_veedor
  on public.player_invitations
  for select
  to authenticated
  using (public.current_user_role() in ('admin', 'veedor'));

-- 2. INSERT: admin o veedor (los dos pueden invitar).
create policy player_invitations_insert_admin_veedor
  on public.player_invitations
  for insert
  to authenticated
  with check (public.current_user_role() in ('admin', 'veedor'));

-- 3. UPDATE: solo admin (cancelar / extender). La aceptacion y el decline
--    pasan por server actions SECURITY DEFINER en PR 6 que bypassean RLS.
create policy player_invitations_update_admin
  on public.player_invitations
  for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- 4. DELETE: bloqueado. Las invitaciones expiradas se quedan como historial.

-- NOTA: anon NO tiene policy de SELECT. El acceso publico a /invite/<token>
-- se hace via la funcion SECURITY DEFINER `get_invite_by_token` definida
-- abajo. Esto evita exponer la tabla entera al anon role.

-- ---------------------------------------------------------------------------
-- Funcion publica: get_invite_by_token
-- ---------------------------------------------------------------------------
-- Lookup publico de un invite por token. Se llama desde la ruta /invite/<token>
-- sin requerir login. Retorna la info del invite + datos del partido/grupo
-- necesarios para que el invitado decida "Voy / No voy".
--
-- Si el token no existe, retorna 0 rows. Si el invite esta expirado, igual
-- lo retorna (el caller decide como manejarlo en la UI).
--
-- Solo expone columnas safe (no created_by, no audit fields irrelevantes).

create or replace function public.get_invite_by_token(p_token text)
returns table (
  invite_id              uuid,
  invite_phone           text,
  invite_nombre_tentativo text,
  invite_used_at         timestamptz,
  invite_declined_at     timestamptz,
  invite_expires_at      timestamptz,
  grupo_id               uuid,
  grupo_nombre           text,
  grupo_dia_semana       int,
  grupo_hora             time,
  grupo_cupo_titulares   int,
  lugar_nombre           text,
  lugar_google_maps_url  text,
  convocatoria_id        uuid,
  convocatoria_fecha     date,
  convocatoria_hora      time
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    inv.id,
    inv.phone,
    inv.nombre_tentativo,
    inv.used_at,
    inv.declined_at,
    inv.expires_at,
    g.id,
    g.nombre,
    g.dia_semana,
    g.hora,
    g.cupo_titulares,
    l.nombre,
    l.google_maps_url,
    c.id,
    c.fecha,
    c.hora
  from public.player_invitations inv
  join public.grupos g on g.id = inv.grupo_id
  join public.lugares l on l.id = g.lugar_id
  left join public.convocatorias c on c.id = inv.convocatoria_id
  where inv.token = p_token
  limit 1
$$;

comment on function public.get_invite_by_token(text) is
  'Fase 9: lookup publico de invitacion por token. Llamada desde /invite/<token> sin login. Expone solo columnas safe.';

revoke all on function public.get_invite_by_token(text) from public;
grant execute on function public.get_invite_by_token(text) to anon, authenticated;
