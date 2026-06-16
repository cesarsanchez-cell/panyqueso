-- ============================================================================
-- FUT-123 (Fase B): el admin otorga/quita el rango de veedor desde la app
-- ============================================================================
--
-- El veedor es GLOBAL (audita ratings, no está atado a un grupo). Hoy se setea a
-- mano en Supabase; esto lo trae a una pantalla admin. El veedor TAMBIÉN juega:
-- conserva su ficha de players (sigue siendo convocable/puntuable). El rol es una
-- sola columna, así que quitar veedor lo devuelve a 'player' (si tiene ficha) o a
-- NULL.
--
-- Barreras (dentro de los RPC, SECURITY DEFINER):
--   - Solo el admin otorga/quita (current_user_role() = 'admin').
--   - No a uno mismo (P0091), no a un admin (P0092).
--   - No se puede hacer veedor a un coordinador sin sacarle antes la
--     coordinación (P0093) — rangos excluyentes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- set_veedor: otorga (true) o quita (false) el rango de veedor
-- ---------------------------------------------------------------------------
create or replace function public.set_veedor(
  p_profile_id uuid,
  p_es_veedor  boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role       public.user_role;
  v_has_player boolean;
begin
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;

  if p_profile_id = auth.uid() then
    raise exception 'no_a_uno_mismo' using errcode = 'P0091';
  end if;

  select role into v_role from public.profiles where id = p_profile_id;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0033';
  end if;

  if v_role = 'admin' then
    raise exception 'no_a_un_admin' using errcode = 'P0092';
  end if;

  if p_es_veedor then
    -- No pisar la coordinación: hay que sacarla primero.
    if v_role = 'coordinador' then
      raise exception 'quitar_coordinacion_primero' using errcode = 'P0093';
    end if;
    update public.profiles
       set role = 'veedor'
     where id = p_profile_id
       and role is distinct from 'veedor';
  else
    -- Quitar veedor: vuelve a 'player' si tiene ficha, si no a NULL.
    if v_role = 'veedor' then
      select exists (
        select 1 from public.players where auth_user_id = p_profile_id
      ) into v_has_player;

      update public.profiles
         set role = case when v_has_player then 'player'::public.user_role else null end
       where id = p_profile_id;
    end if;
  end if;
end;
$$;

revoke all on function public.set_veedor(uuid, boolean) from public, anon;
grant execute on function public.set_veedor(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- listar_perfiles_para_veedor: candidatos (jugadores con cuenta) + si ya es veedor
-- ---------------------------------------------------------------------------
-- Lista los jugadores con cuenta cuyo rol se puede togglear a veedor (player /
-- sin rol / ya veedor). No incluye admin ni coordinador (rangos excluyentes).
create or replace function public.listar_perfiles_para_veedor()
returns table (
  profile_id uuid,
  nombre     text,
  phone      text,
  es_veedor  boolean
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'not_authorized' using errcode = 'P0013';
  end if;

  return query
  select p.auth_user_id, p.nombre, p.phone, (pr.role = 'veedor')
    from public.players p
    join public.profiles pr on pr.id = p.auth_user_id
   where p.auth_user_id is not null
     and (pr.role is null or pr.role in ('player', 'veedor'))
   order by p.nombre asc;
end;
$$;

revoke all on function public.listar_perfiles_para_veedor() from public, anon;
grant execute on function public.listar_perfiles_para_veedor() to authenticated;
