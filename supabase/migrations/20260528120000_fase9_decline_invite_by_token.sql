-- ============================================================================
-- Fase 9 PR 7: funcion publica decline_invite_by_token
-- ============================================================================
--
-- Contexto:
--   La pagina publica /invite/<token> tiene dos botones: "Voy" y "No voy".
--   Voy abre el signup en /invite/<token>/aceptar (PR 8). No voy marca el
--   invite como declinado y cierra el ciclo.
--
--   Como el caller es anonimo (no esta logueado), necesitamos una funcion
--   SECURITY DEFINER analoga a get_invite_by_token que setee declined_at.
--   El token actua como capability: quien tenga el link puede ejecutar
--   decline en su invite.
--
-- Comportamiento:
--   - Si el invite no existe -> retorna false.
--   - Si ya fue used o declined -> retorna false (no-op, idempotente).
--   - Si esta expirado -> retorna false (no se puede declinar un link muerto).
--   - Caso normal -> setea declined_at = now() y retorna true.
--
-- Por que no policy + grant anon update:
--   Abrir UPDATE de player_invitations a anon expondria mas superficie. Esta
--   funcion limita la operacion a "declinar un invite especifico por token"
--   sin tocar otros campos ni otros rows.
-- ============================================================================

create or replace function public.decline_invite_by_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.player_invitations%rowtype;
begin
  select * into v_invite
  from public.player_invitations
  where token = p_token
  limit 1;

  if not found then
    return false;
  end if;

  if v_invite.used_at is not null or v_invite.declined_at is not null then
    return false;
  end if;

  if v_invite.expires_at <= now() then
    return false;
  end if;

  update public.player_invitations
  set declined_at = now()
  where id = v_invite.id;

  return true;
end;
$$;

comment on function public.decline_invite_by_token(text) is
  'Fase 9: declinar invitacion por token. Llamada desde /invite/<token> sin login. Idempotente y safe (no-op si ya esta usado/declinado/expirado).';

revoke all on function public.decline_invite_by_token(text) from public;
grant execute on function public.decline_invite_by_token(text) to anon, authenticated;
