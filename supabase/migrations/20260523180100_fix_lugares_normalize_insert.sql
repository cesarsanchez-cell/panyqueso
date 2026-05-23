-- ============================================================================
-- Fase 5 PR 1 hotfix: trigger lugares_normalize_insert con guard auth.uid()
-- ============================================================================
--
-- Bug del PR original (20260523180000):
--   lugares_normalize_insert hacia `new.created_by := auth.uid()` sin
--   condicion. Cuando se invoca desde un rol sin sesion (postgres en tests
--   setup, service_role en seeds), auth.uid() es null y el trigger pisa el
--   valor explicito con NULL -> NOT NULL violation.
--
-- Fix: ejecutar el override solo si auth.uid() devuelve un uuid no nulo.
-- La defensa anti-spoof se mantiene: en cualquier sesion autenticada el
-- trigger sigue forzando created_by = auth.uid(). En contextos server-side
-- (postgres, service_role), el valor explicito pasa.
--
-- Forward-only: dejamos la migracion 20260523180000 intacta (ya aplicada en
-- prod) y reemplazamos la funcion con CREATE OR REPLACE.
-- ============================================================================

create or replace function public.lugares_normalize_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is not null then
    new.created_by := v_caller;
  end if;
  return new;
end;
$$;
