-- ============================================================================
-- Buscar una cuenta de gestión (coordinador/veedor) por celular
-- ============================================================================
--
-- Fase 3 del coordinador/veedor sin ficha. Al invitar por WhatsApp (alta de un
-- coordinador/veedor puro), si el celular YA tiene cuenta no queremos un
-- callejón: si es una cuenta de gestión (sin ficha de jugador) la sumamos al
-- nuevo grupo (multi-grupo) en vez de fallar.
--
-- profiles NO guarda el celular, así que la única forma de encontrar la cuenta
-- por teléfono es por el email sintético (<celular>@phone.fdlm.local) en
-- auth.users. SECURITY DEFINER para poder leer auth.users; gateada a
-- admin/coordinador (devuelve un auth id, no lo exponemos a cualquiera).
--
-- Devuelve la cuenta (id + rol + si tiene ficha de jugador) o ninguna fila.
-- ============================================================================

create or replace function public.buscar_cuenta_gestion_por_celular(p_celular text)
returns table (auth_user_id uuid, rol public.user_role, tiene_ficha boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() not in ('admin', 'coordinador') then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;

  return query
  select
    u.id,
    p.role,
    exists (select 1 from public.players pl where pl.auth_user_id = u.id)
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.email = lower(p_celular) || '@phone.fdlm.local'
  limit 1;
end;
$$;

comment on function public.buscar_cuenta_gestion_por_celular(text) is
  'Fase 3 coord/veedor sin ficha: encuentra la cuenta (auth.users) por el email sintético del celular y devuelve su rol + si tiene ficha de jugador. Para sumar un coordinador/veedor puro existente a otro grupo (multi-grupo). admin/coordinador only.';

revoke all on function public.buscar_cuenta_gestion_por_celular(text) from public, anon;
grant execute on function public.buscar_cuenta_gestion_por_celular(text) to authenticated;
