-- ============================================================================
-- Confianza (Fase 3): 'inicial' como estado de arranque (default + alta + backfill)
-- ============================================================================
--
-- Decisiones:
--   * Default de la columna → 'inicial' (cubre inserts que no lo especifican).
--   * Las RPCs de alta insertan 'baja' literal con el sentido de "sin calibrar"
--     (lo dice su propio comentario). En vez de reproducir 6 funciones grandes
--     (riesgo de pisar mejoras), un trigger BEFORE INSERT en players traduce
--     ese 'baja' de alta → 'inicial'. A nivel INSERT, 'baja' SIEMPRE significa
--     "todavía sin evaluar" (la evaluación real ocurre después, vía UPDATE).
--   * Backfill: lo que hoy está en 'baja' y nunca fue evaluado pasa a 'inicial'
--     (respeta el criterio a nivel jugador de FUT-263: evaluado en algún lado ⇒
--     no es inicial). Lo evaluado (media/alta, o con solicitud) queda intacto.
-- ============================================================================

-- 1. Default --------------------------------------------------------------
alter table public.players alter column rating_confidence set default 'inicial';
alter table public.player_group_ratings alter column rating_confidence set default 'inicial';

-- 2. Trigger de alta: baja (sin calibrar) → inicial -------------------------
create or replace function public.players_default_confianza_inicial()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- En un alta, 'baja' es el sentinel histórico de "sin calibrar todavía".
  -- Lo normalizamos a 'inicial' para que el estado sea explícito.
  if new.rating_confidence = 'baja' then
    new.rating_confidence := 'inicial';
  end if;
  return new;
end;
$$;

comment on function public.players_default_confianza_inicial() is
  'FUT-127 Fase 3: en el alta, traduce rating_confidence baja→inicial (a nivel INSERT, baja = sin calibrar). La confianza real se setea después por el veedor/admin vía UPDATE.';

drop trigger if exists players_confianza_inicial on public.players;
create trigger players_confianza_inicial
  before insert on public.players
  for each row
  execute function public.players_default_confianza_inicial();

-- 3. Backfill de lo nunca evaluado -----------------------------------------
-- El backfill toca rating_confidence; el trigger players_enforce_immutability
-- bloquea ese cambio salvo bajo app.applying_change_request (= cómo lo aplican
-- las RPCs de rating). Lo seteamos para esta transacción.
select set_config('app.applying_change_request', 'true', true);

update public.players p
   set rating_confidence = 'inicial'
 where p.rating_confidence = 'baja'
   and not exists (
     select 1 from public.player_change_requests r
      where r.player_id = p.id
        and r.action_type = 'update_sensitive_fields'
        and r.status <> 'rejected'
   );

update public.player_group_ratings g
   set rating_confidence = 'inicial'
 where g.rating_confidence = 'baja'
   and not exists (
     select 1 from public.player_change_requests r
      where r.player_id = g.player_id
        and r.action_type = 'update_sensitive_fields'
        and r.status <> 'rejected'
   );
