-- ============================================================================
-- FUT-122 (Fase A): el admin otorga/quita el rango de coordinador desde la app
-- ============================================================================
--
-- Hoy, para hacer a alguien coordinador hacían falta DOS pasos manuales: (1)
-- setear profiles.role = 'coordinador' a mano en Supabase y (2) vincularlo al
-- grupo en coordinador_grupos. Esto lo unifica: asignar a un miembro a un grupo
-- le OTORGA el rango (un solo paso, desde la pantalla del grupo). Quitarlo de su
-- ÚLTIMO grupo le saca el rango y lo devuelve a 'player' (no a NULL, que lo
-- dejaría sin acceso a la app → /sin-rol).
--
-- Barreras (todas dentro de los RPC, SECURITY DEFINER):
--   - Solo el admin otorga/quita rango (current_user_role() = 'admin').
--   - Nunca se otorga 'admin' ni se toca a un admin/veedor existente.
--   - El rol es una sola columna (admin|veedor|coordinador|player|null): por eso
--     promover cambia la vista de login de la persona al panel de coordinador.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- asignar_coordinador_a_grupo: otorga el rango (si hace falta) + liga al grupo
-- ---------------------------------------------------------------------------
create or replace function public.asignar_coordinador_a_grupo(
  p_profile_id uuid,
  p_grupo_id   uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
begin
  -- Solo el admin otorga rango. is distinct from maneja el NULL (sin rol → raise).
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;

  if not exists (select 1 from public.grupos where id = p_grupo_id) then
    raise exception 'grupo_not_found' using errcode = 'P0030';
  end if;

  select role into v_role from public.profiles where id = p_profile_id;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0033';
  end if;

  -- No pisar otros rangos: si ya es admin o veedor, hay que quitárselo primero.
  if v_role in ('admin', 'veedor') then
    raise exception 'tiene_otro_rango' using errcode = 'P0090';
  end if;

  -- Otorga el rango coordinador (si venía de player/NULL) — idempotente.
  update public.profiles
     set role = 'coordinador'
   where id = p_profile_id
     and role is distinct from 'coordinador';

  -- Liga al grupo. Si ya estaba, no hace nada (no es error).
  insert into public.coordinador_grupos (profile_id, grupo_id, created_by)
  values (p_profile_id, p_grupo_id, auth.uid())
  on conflict (profile_id, grupo_id) do nothing;
end;
$$;

revoke all on function public.asignar_coordinador_a_grupo(uuid, uuid) from public, anon;
grant execute on function public.asignar_coordinador_a_grupo(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- quitar_coordinador_de_grupo: desliga del grupo + (si era el último) baja el rango
-- ---------------------------------------------------------------------------
create or replace function public.quitar_coordinador_de_grupo(
  p_coordinador_grupo_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_has_player boolean;
begin
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;

  delete from public.coordinador_grupos
   where id = p_coordinador_grupo_id
   returning profile_id into v_profile_id;

  -- Idempotente: si la fila no existía, no hay nada más que hacer.
  if v_profile_id is null then
    return;
  end if;

  -- Si todavía gestiona otros grupos, conserva el rango coordinador.
  if exists (
    select 1 from public.coordinador_grupos where profile_id = v_profile_id
  ) then
    return;
  end if;

  -- Era su último grupo: le sacamos el rango. Si tiene ficha de jugador vuelve a
  -- 'player' (para que siga usando la app); si no, queda sin rol.
  select exists (
    select 1 from public.players where auth_user_id = v_profile_id
  ) into v_has_player;

  update public.profiles
     set role = case when v_has_player then 'player'::public.user_role else null end
   where id = v_profile_id
     and role = 'coordinador';
end;
$$;

revoke all on function public.quitar_coordinador_de_grupo(uuid) from public, anon;
grant execute on function public.quitar_coordinador_de_grupo(uuid) to authenticated;
