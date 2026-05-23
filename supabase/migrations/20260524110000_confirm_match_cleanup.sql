-- ============================================================================
-- Fase 6 PR 3: helper SECURITY DEFINER para rollback de confirm_match
-- ============================================================================
--
-- El server action confirmMatch (TS) hace una cadena de INSERTs:
--   1. matches
--   2. match_teams (A y B)
--   3. match_team_players
--   4. UPDATE convocatorias.status = 'cerrada'
--
-- Si los pasos 2/3/4 fallan, queremos borrar el match recien creado en (1)
-- para no dejar registros huerfanos. Pero matches tiene DELETE bloqueado
-- por RLS (Fase 2 FUT-29) intencionalmente — para preservar historia.
--
-- Solucion: esta funcion SECURITY DEFINER permite a un admin borrar un
-- match SOLO si la convocatoria asociada sigue en status='abierta' (=>
-- el confirmMatch no llego al paso final, es un orphan). Una vez que
-- la convocatoria pasa a 'cerrada', el match es inmutable.
--
-- Codigos de error:
--   P0001  auth_required
--   P0003  not_an_admin
--   P0050  convocatoria_finalized (no es orphan, no se borra)
-- ============================================================================

create or replace function public.confirm_match_cleanup(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller       uuid := auth.uid();
  v_role         text;
  v_conv_status  text;
begin
  if v_caller is null then
    raise exception 'auth_required' using errcode = 'P0001';
  end if;

  select role::text into v_role
  from public.profiles
  where id = v_caller;

  if v_role is null or v_role <> 'admin' then
    raise exception 'not_an_admin' using errcode = 'P0003';
  end if;

  select c.status::text into v_conv_status
  from public.matches m
  join public.convocatorias c on c.id = m.convocatoria_id
  where m.id = p_match_id;

  if v_conv_status is null then
    -- Match no existe (ya fue borrado o nunca existio). Idempotente.
    return;
  end if;

  if v_conv_status <> 'abierta' then
    -- La convocatoria ya quedo cerrada/jugada/cancelada: el match es
    -- historico, no se permite borrar.
    raise exception 'convocatoria_finalized' using errcode = 'P0050';
  end if;

  -- Cascade delete limpia match_teams y match_team_players.
  delete from public.matches where id = p_match_id;
end;
$$;

comment on function public.confirm_match_cleanup(uuid) is
  'Fase 6 PR 3: borra un match recien creado si la convocatoria asociada sigue abierta. Solo admin. Sirve de rollback para el confirmMatch del server action TS.';

revoke all on function public.confirm_match_cleanup(uuid) from public;
grant execute on function public.confirm_match_cleanup(uuid) to authenticated;
