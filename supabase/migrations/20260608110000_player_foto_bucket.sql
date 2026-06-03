-- ============================================================================
-- Foto de perfil del jugador (FUT-75): bucket de Storage + exponer avatar_url
-- ============================================================================
--
-- La columna public.players.avatar_url YA existe (fase9, quedó prevista para
-- esto). Acá:
--   (1) Bucket público `player-photos`: lectura pública vía URL; la escritura
--       la hace una server action con cliente service-role (previa validación
--       de authz), así que no hacen falta policies de storage.objects.
--   (2) get_my_player_summary devuelve avatar_url para mostrar el avatar del
--       jugador en /mi-perfil y /perfil. Cambia el return type -> drop + create.
--
-- La foto es un dato neutro/positivo -> permitido en la vista del jugador
-- (CLAUDE.md).
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('player-photos', 'player-photos', true)
on conflict (id) do nothing;

drop function if exists public.get_my_player_summary();

create or replace function public.get_my_player_summary()
returns table (
  id         uuid,
  nombre     text,
  status     public.player_status,
  apodo      text,
  avatar_url text
)
language sql
security definer
set search_path = ''
stable
as $$
  select p.id, p.nombre, p.status, p.apodo, p.avatar_url
    from public.players p
   where p.auth_user_id = auth.uid()
   limit 1
$$;

comment on function public.get_my_player_summary() is
  'Fase 9 / FUT-75: datos safe del propio jugador (id/nombre/status/apodo/avatar_url) para /mi-perfil y /perfil. SECURITY DEFINER porque el rol player no tiene SELECT directo en public.players.';

revoke all on function public.get_my_player_summary() from public;
grant execute on function public.get_my_player_summary() to authenticated;
