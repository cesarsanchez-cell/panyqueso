-- ============================================================================
-- FUT-24: trigger de normalizacion en INSERT de player_change_requests
-- ============================================================================
--
-- Defense in depth en INSERT. El admin inserta requests via Server Action
-- (FUT-32+) y, aunque las RLS de FUT-26 van a validar role=admin y que
-- requested_by coincida con auth.uid(), este trigger garantiza que aun una
-- conexion con bypass de RLS no pueda inyectar un request ya-aprobado o
-- atribuido a otro usuario.
--
-- Normalizaciones:
--   1. Forzar status='pending'. Cualquier transicion (approved/rejected/
--      flagged) tiene que pasar por approve/reject/flag.
--   2. Nullear evidencia de revisor: reviewed_by, reviewed_at,
--      review_comment, created_player_id. Estos solo los escriben las
--      funciones SECURITY DEFINER al aprobar/rechazar/flagear.
--   3. Si auth.uid() esta presente, sobreescribir requested_by con
--      auth.uid(). Evita "soy admin A pero creo el request a nombre de B".
--      Si auth.uid() es NULL (service_role, migracion seed), se respeta el
--      valor enviado.
--
-- created_at se deja al DEFAULT de la columna (now()).
-- ============================================================================

create or replace function public.player_change_requests_normalize_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_caller_id uuid;
begin
  v_caller_id := auth.uid();

  -- Status siempre arranca en pending. Aunque el admin mande 'approved' por
  -- error o por mala fe, se normaliza.
  new.status := 'pending';

  -- Limpiar cualquier evidencia de revision. Solo las funciones SECURITY
  -- DEFINER tienen autoridad para escribir estos campos.
  new.reviewed_by       := null;
  new.reviewed_at       := null;
  new.review_comment    := null;
  new.created_player_id := null;

  -- Identidad del requester: forzar al usuario autenticado.
  if v_caller_id is not null then
    new.requested_by := v_caller_id;
  end if;

  return new;
end;
$$;

comment on function public.player_change_requests_normalize_insert() is
  'Plan v4 FUT-24. Normaliza el INSERT de un player_change_request: fuerza status=pending, nullea reviewed_*, forza requested_by=auth.uid() cuando hay sesion.';

revoke all on function public.player_change_requests_normalize_insert() from public;

create trigger player_change_requests_normalize_insert
  before insert on public.player_change_requests
  for each row
  execute function public.player_change_requests_normalize_insert();
