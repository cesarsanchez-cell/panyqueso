-- ============================================================================
-- FUT-23: trigger de inmutabilidad de campos sensibles en players
-- ============================================================================
--
-- Defense in depth: aunque las RLS de FUT-26 van a bloquear el UPDATE de
-- clientes sobre players, este trigger garantiza que aun una conexion con
-- bypass de RLS (service_role, SECURITY DEFINER mal escrita, etc.) NO pueda
-- mutar campos sensibles fuera de approve_player_change_request (FUT-20).
--
-- Mecanismo: la unica via legitima para cambiar campos sensibles es
-- approve_player_change_request, que setea
-- `app.applying_change_request='true'` antes de hacer el UPDATE. El trigger
-- lo verifica y deja pasar el cambio. Cualquier otro UPDATE que toque un
-- campo sensible falla con P0010.
--
-- Tres categorias:
--
--   1. IDENTIDAD/DERIVADOS: inmutables SIEMPRE (incluso desde approve).
--        id, created_at, created_by, internal_score
--      Para internal_score: lo recalcula el trigger players_compute_score
--      (FUT-16/19). Ese trigger corre DESPUES de este (orden alfabetico:
--      players_b < players_c), asi que al momento de validar aca, el
--      NEW.internal_score todavia coincide con OLD.internal_score (postgres
--      copia el valor si el UPDATE no lo menciona). Si alguien intenta
--      mandar internal_score=X en el SET, el trigger raisea.
--
--   2. SENSIBLES: mutables solo via approve (session var = 'true').
--        nombre, edad, role_field, position_pref, positions_possible,
--        technical, physical, mental, rating_confidence, status
--
--   3. LIBRES: editables por el admin via UPDATE normal (privacy del plan v4
--      las acepta como "no sensibles"):
--        private_notes, updated_at
--
-- Error codes:
--   P0010 sensitive_field_immutable  (detail = nombre del campo)
--   P0011 identity_field_immutable   (detail = nombre del campo)
-- ============================================================================

create or replace function public.players_enforce_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_applying text;
begin
  -- 1. Identidad / derivados: nunca mutables.
  if new.id is distinct from old.id then
    raise exception 'identity_field_immutable'
      using errcode = 'P0011', detail = 'id';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'identity_field_immutable'
      using errcode = 'P0011', detail = 'created_at';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'identity_field_immutable'
      using errcode = 'P0011', detail = 'created_by';
  end if;
  if new.internal_score is distinct from old.internal_score then
    raise exception 'identity_field_immutable'
      using errcode = 'P0011', detail = 'internal_score';
  end if;

  -- 2. Sensibles: solo si el UPDATE viene de approve_player_change_request.
  v_applying := current_setting('app.applying_change_request', true);
  if v_applying = 'true' then
    return new;
  end if;

  if new.nombre is distinct from old.nombre then
    raise exception 'sensitive_field_immutable'
      using errcode = 'P0010', detail = 'nombre';
  end if;
  if new.edad is distinct from old.edad then
    raise exception 'sensitive_field_immutable'
      using errcode = 'P0010', detail = 'edad';
  end if;
  if new.role_field is distinct from old.role_field then
    raise exception 'sensitive_field_immutable'
      using errcode = 'P0010', detail = 'role_field';
  end if;
  if new.position_pref is distinct from old.position_pref then
    raise exception 'sensitive_field_immutable'
      using errcode = 'P0010', detail = 'position_pref';
  end if;
  if new.positions_possible is distinct from old.positions_possible then
    raise exception 'sensitive_field_immutable'
      using errcode = 'P0010', detail = 'positions_possible';
  end if;
  if new.technical is distinct from old.technical then
    raise exception 'sensitive_field_immutable'
      using errcode = 'P0010', detail = 'technical';
  end if;
  if new.physical is distinct from old.physical then
    raise exception 'sensitive_field_immutable'
      using errcode = 'P0010', detail = 'physical';
  end if;
  if new.mental is distinct from old.mental then
    raise exception 'sensitive_field_immutable'
      using errcode = 'P0010', detail = 'mental';
  end if;
  if new.rating_confidence is distinct from old.rating_confidence then
    raise exception 'sensitive_field_immutable'
      using errcode = 'P0010', detail = 'rating_confidence';
  end if;
  if new.status is distinct from old.status then
    raise exception 'sensitive_field_immutable'
      using errcode = 'P0010', detail = 'status';
  end if;

  return new;
end;
$$;

comment on function public.players_enforce_immutability() is
  'Plan v4 FUT-23. Defense in depth: bloquea UPDATE de campos sensibles e identidad fuera de approve_player_change_request. La session var app.applying_change_request=true autoriza el cambio de sensibles.';

revoke all on function public.players_enforce_immutability() from public;

-- Nombre alfabeticamente anterior a players_compute_score para que este
-- trigger valide ANTES de que se recalcule internal_score. Ver comentario
-- sobre orden de triggers en la categoria 1.
create trigger players_block_sensitive_updates
  before update on public.players
  for each row
  execute function public.players_enforce_immutability();
