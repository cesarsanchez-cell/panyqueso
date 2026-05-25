-- ============================================================================
-- Fase 9 PR B: admin tiene autoridad directa sobre datos del jugador
-- ============================================================================
--
-- Cambio de modelo de poderes en el sistema. El MVP de Fase 2 (FUT-23, 26)
-- gateaba casi todo via audit del veedor: nombre, edad, role_field,
-- position_pref, positions_possible, technical, physical, mental,
-- rating_confidence y status solo se podian cambiar via
-- approve_player_change_request.
--
-- Nuevo modelo: el veedor SOLO existe para evitar abusos en las
-- calificaciones (ratings). Todo lo demas - correcciones de datos, cambios
-- de email, celular, nombre, posicion, status - es responsabilidad del
-- admin y se hace directo.
--
-- Lo que sigue gateado por veedor (audit + immutability trigger):
--   technical, physical, mental, rating_confidence
--
-- Lo que pasa a ser admin-direct:
--   nombre, edad, role_field, position_pref, positions_possible, status
--   (phone, email, apodo, pierna_habil, fecha_nacimiento, private_notes ya
--    eran admin-direct desde PR #66 y FUT-26)
--
-- Cambios concretos:
--   1. Trigger players_enforce_immutability: sacar de la lista de sensibles
--      los campos que pasan a admin-direct. Mantener solo los 4 ratings.
--   2. GRANT UPDATE de las nuevas columnas admin-direct.
--   3. La policy players_update_admin_notes ya existe y es admin-only;
--      cubre todas las columnas con GRANT activo.
--
-- Lo que NO cambia:
--   - Identidad/derivados (id, created_at, created_by, internal_score):
--     siguen inmutables siempre, igual que antes.
--   - approve_player_change_request sigue existiendo para
--     update_sensitive_fields (ahora solo ratings). Los otros action_types
--     (create_player, deactivate/reactivate) siguen funcionando para
--     backwards compat con requests viejos pendientes; nuevas requests de
--     ese tipo no se crean desde la UI.
-- ============================================================================

-- 1. Trigger relajado: solo los 4 ratings son sensibles.

create or replace function public.players_enforce_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_applying text;
begin
  -- IDENTIDAD/DERIVADOS: siempre inmutables.
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

  -- SENSIBLES (solo via approve_player_change_request): los 4 ratings.
  v_applying := current_setting('app.applying_change_request', true);
  if v_applying = 'true' then
    return new;
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

  -- nombre, edad, role_field, position_pref, positions_possible, status:
  -- admin-direct desde Fase 9 PR B. La policy players_update_admin_notes
  -- los gatea por rol; la column-level GRANT los habilita.

  return new;
end;
$$;

comment on function public.players_enforce_immutability() is
  'Plan v4 FUT-23 + Fase 9 PR B: bloquea UPDATE de ratings fuera de approve_player_change_request. Identidad/derivados inmutables siempre. Resto de los campos (nombre, edad, posicion, status, etc.) son admin-direct via column-level GRANT + policy players_update_admin_notes.';

-- 2. GRANT UPDATE de las columnas admin-direct.

grant update (
  nombre,
  edad,
  role_field,
  position_pref,
  positions_possible,
  status
) on public.players to authenticated;

-- 3. La policy players_update_admin_notes ya existe. Re-emito un comment
-- actualizado para reflejar el alcance ampliado.

comment on policy players_update_admin_notes on public.players is
  'Fase 9 PR B: admin puede UPDATE cualquier columna con GRANT activo. Eso incluye private_notes + datos de contacto (Fase 9 PR 66) + nombre/edad/role_field/position_pref/positions_possible/status (este PR). Los 4 ratings siguen bloqueados por el trigger + falta de GRANT (solo se cambian via approve_player_change_request).';
