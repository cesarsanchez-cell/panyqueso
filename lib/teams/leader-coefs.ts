import type { createClient } from "@/lib/supabase/server";

import { NO_LEADER_BOOST, type LeaderCoefs } from "./generate.ts";

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

/**
 * FUT-127: lee de app_settings los coeficientes de potenciación por líder
 * (medio/alto). Default 1.00 = sin efecto. Cualquier autenticado puede leerlos
 * (app_settings_select_all), así el admin y el coordinador arman con el mismo
 * criterio. Si no hay fila o falla, devuelve sin potenciación.
 */
export async function loadLeaderCoefs(supabase: SupabaseLike): Promise<LeaderCoefs> {
  const { data } = await supabase
    .from("app_settings")
    .select("liderazgo_coef_positivo, liderazgo_coef_negativo")
    .maybeSingle();
  if (!data) return NO_LEADER_BOOST;
  return {
    positivo: Number(data.liderazgo_coef_positivo ?? 1),
    negativo: Number(data.liderazgo_coef_negativo ?? 1),
  };
}
