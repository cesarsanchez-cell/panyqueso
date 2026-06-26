-- ============================================================================
-- find_reclaimable_orphan: detecta una cuenta de auth HUÉRFANA reclamable
-- ============================================================================
--
-- Contexto (bug del alta no atómica): el alta por link crea primero la cuenta de
-- auth (createUser) y después la ficha (claim). Si el proceso se corta entre los
-- dos pasos (pestaña cerrada, red lenta, "cargó por la mitad"), queda una cuenta
-- de auth con el email sintético del celular pero SIN ficha en players. Esa
-- cuenta huérfana ocupa el celular y hace que todo alta futura choque con
-- "ya existe una cuenta" — un callejón sin salida.
--
-- Esta función, dado el celular, devuelve el id de esa cuenta SOLO si es
-- reclamable, es decir, un residuo seguro de borrar:
--   (a) no existe NINGUNA ficha (players) con ese celular, y
--   (b) la cuenta NUNCA se logueó (auth.users.last_sign_in_at IS NULL).
-- Si alguna de las dos no se cumple, devuelve null: es una cuenta real y no se
-- toca. El borrado lo hace el server action con el admin client (deleteUser);
-- esta función solo decide si hay algo reclamable.
--
-- Lee auth.users (security definer). service_role-only: la invoca el server
-- action de alta, nunca un cliente.
-- ============================================================================

create or replace function public.find_reclaimable_orphan(p_phone text)
returns uuid
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_email   text := lower(p_phone) || '@phone.fdlm.local';
  v_user_id uuid;
  v_last    timestamptz;
begin
  -- (a) Si ya hay ficha con ese celular, no es huérfano: nada que reclamar.
  if exists (select 1 from public.players where phone = p_phone) then
    return null;
  end if;

  select u.id, u.last_sign_in_at
    into v_user_id, v_last
    from auth.users u
   where u.email = v_email;

  -- No hay cuenta con ese email sintético.
  if v_user_id is null then
    return null;
  end if;

  -- (b) La cuenta se logueó alguna vez → es real, no se toca.
  if v_last is not null then
    return null;
  end if;

  -- Cuenta sin ficha y nunca logueada → residuo reclamable.
  return v_user_id;
end;
$$;

comment on function public.find_reclaimable_orphan(text) is
  'Alta auto-curable: dado un celular, devuelve el id de la cuenta de auth huérfana (sin ficha + nunca logueada) para que el server action la borre y reintente. null si no hay nada reclamable (cuenta real o inexistente).';

revoke all on function public.find_reclaimable_orphan(text) from public, anon, authenticated;
grant execute on function public.find_reclaimable_orphan(text) to service_role;
