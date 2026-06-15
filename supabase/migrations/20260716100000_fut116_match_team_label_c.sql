-- ============================================================================
-- FUT-116 (Fase 12 / A4): match_team_label += 'C'
-- ============================================================================
--
-- El modo presentismo puede armar hasta 3 equipos. Para que la sesión "cuente"
-- (participación en historial + premios votados), se crea un match real con
-- match_teams A/B/C. Hace falta el valor 'C' en el enum.
--
-- Se agrega acá solo; se USA en la migración siguiente (no se puede usar un valor
-- de enum recién agregado en la misma transacción).
--
-- El resto del pipeline ya tolera esto sin cambios:
--   - get_my_match_history: presentismo crea el match con winner NULL → cae en
--     'sin_resultado' sin importar el label (no calcula V/E/D para 'C').
--   - premios (figura/carnicero): ventana de tiempo (fecha+hora → +48h) +
--     participantes (match_team_players). No dependen del resultado ni del label.
-- ============================================================================

do $$
begin
  if not exists (
    select 1
      from pg_enum e
      join pg_type t on e.enumtypid = t.oid
     where t.typname = 'match_team_label'
       and e.enumlabel = 'C'
  ) then
    alter type public.match_team_label add value 'C';
  end if;
end$$;
