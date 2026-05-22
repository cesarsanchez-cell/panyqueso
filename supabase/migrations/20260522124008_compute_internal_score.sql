-- ============================================================================
-- FUT-19: funcion compute_internal_score + refactor del trigger de players
-- ============================================================================
--
-- Extrae la formula inline del trigger players_set_internal_score (FUT-16)
-- a una funcion publica reusable. Las funciones SECURITY DEFINER de
-- FUT-20+ (approve_player_change_request, etc.) tambien la usaran al
-- aplicar updates.
--
-- Plan v4 seccion 5: scoring formula con factor_edad como modulador suave
-- del aporte fisico.
--
--   factor_edad = 1.00                                  si edad <= 32
--               = 0.75                                  si edad >= 55
--               = max(0.75, 1.00 - (edad-32)*0.015)     intermedio
--
--   internal_score = technical * 0.45
--                  + physical  * factor_edad * 0.30
--                  + mental    * 0.25
--
-- La funcion es:
--   - language sql       (no plpgsql; es una expresion pura).
--   - immutable          (misma entrada => misma salida, sin side effects).
--   - parallel safe      (puede paralelizarse).
--   - security invoker   (default; no es SECURITY DEFINER porque no toca
--                         tablas con RLS).
--   - search_path = ''   (defense in depth aunque no haga lookups).
-- ============================================================================

create or replace function public.compute_internal_score(
  p_technical int,
  p_physical  int,
  p_mental    int,
  p_edad      int
)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select round(
      (p_technical::numeric * 0.45)
    + (p_physical::numeric
        * (case
             when p_edad <= 32 then 1.00::numeric
             when p_edad >= 55 then 0.75::numeric
             else greatest(0.75::numeric, 1.00::numeric - (p_edad - 32)::numeric * 0.015)
           end)
        * 0.30)
    + (p_mental::numeric * 0.25),
    2
  )
$$;

comment on function public.compute_internal_score(int, int, int, int) is
  'Plan v4 seccion 5. Pura, immutable. Calculo del puntaje interno desde technical, physical, mental, edad. Reusada por el trigger players_set_internal_score y por las funciones SECURITY DEFINER de FUT-20+.';

-- Permitir que cualquier usuario authenticated pueda llamarla. Es info publica
-- del algoritmo: dado inputs hipoteticos, devuelve el score. El acceso a los
-- inputs reales sigue protegido por RLS sobre players.
revoke all on function public.compute_internal_score(int, int, int, int) from public;
grant execute on function public.compute_internal_score(int, int, int, int) to authenticated;

-- Refactor del trigger function: pasa de logica inline a llamar a la funcion.
-- Mismo comportamiento, menos duplicacion.
create or replace function public.players_set_internal_score()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.internal_score := public.compute_internal_score(
    new.technical, new.physical, new.mental, new.edad
  );
  new.updated_at := now();
  return new;
end;
$$;
