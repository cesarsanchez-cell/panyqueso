-- ============================================================================
-- Notificaciones push (Fase 1): suscripciones Web Push por jugador
-- ============================================================================
--
-- Guarda las suscripciones de Web Push de cada jugador (un row por navegador/
-- dispositivo). El server las usa para mandar el aviso de "se liberó un lugar"
-- (Fase 2). El alta/baja va por RPC SECURITY DEFINER para no exponer un INSERT
-- directo y resolver el upsert por endpoint.
--
-- Privacidad: una suscripción no tiene datos sensibles (endpoint + claves del
-- navegador). El jugador solo ve las suyas (RLS). El envío lo hace el server
-- con service-role (bypassa RLS).
-- ============================================================================

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_player_id_idx
  on public.push_subscriptions (player_id);

alter table public.push_subscriptions enable row level security;

-- El jugador ve solo sus suscripciones. El INSERT/DELETE va por los RPC de
-- abajo (SECURITY DEFINER). El envío server-side usa service-role.
drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select using (player_id = public.current_player_id());

grant select on public.push_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- save_push_subscription: upsert (por endpoint) de la suscripción del jugador
-- actual. Si el mismo navegador re-suscribe, actualiza claves y dueño.
-- ---------------------------------------------------------------------------
create or replace function public.save_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid;
begin
  v_player := public.current_player_id();
  if v_player is null then
    raise exception 'Solo un jugador puede registrar avisos.';
  end if;

  insert into public.push_subscriptions (player_id, endpoint, p256dh, auth, user_agent)
  values (v_player, p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set player_id  = excluded.player_id,
        p256dh     = excluded.p256dh,
        auth       = excluded.auth,
        user_agent = excluded.user_agent,
        updated_at = now();
end;
$$;

comment on function public.save_push_subscription(text, text, text, text) is
  'Fase push v1: upsert de la suscripción Web Push del jugador actual (por endpoint).';

-- ---------------------------------------------------------------------------
-- delete_push_subscription: el jugador da de baja una suscripción suya.
-- ---------------------------------------------------------------------------
create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.push_subscriptions
   where endpoint = p_endpoint
     and player_id = public.current_player_id();
end;
$$;

comment on function public.delete_push_subscription(text) is
  'Fase push v1: baja de una suscripción Web Push del jugador actual.';

revoke all on function public.save_push_subscription(text, text, text, text) from public;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
revoke all on function public.delete_push_subscription(text) from public;
grant execute on function public.delete_push_subscription(text) to authenticated;
