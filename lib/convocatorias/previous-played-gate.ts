import type { createClient } from "@/lib/supabase/server";

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

export type UnplayedPrevious = { id: string; fecha: string; status: string };

/**
 * Regla de secuencia: no se puede CERRAR/confirmar una convocatoria si en el
 * MISMO grupo hay otra ANTERIOR (fecha menor) que todavía no se jugó (status
 * distinto de 'jugada'). Hay que jugar y cargar el resultado del partido viejo
 * antes de confirmar el siguiente, así no se adelantan fechas por error.
 *
 * 'cancelada' no cuenta (en la práctica las canceladas se borran). Una conv sin
 * grupo no tiene con qué compararse, así que no aplica la regla.
 *
 * Devuelve la MÁS VIEJA pendiente (la que toca resolver primero), o null si no
 * hay ninguna que bloquee.
 */
export async function findUnplayedPreviousConvocatoria(
  supabase: SupabaseLike,
  convocatoriaId: string,
): Promise<UnplayedPrevious | null> {
  const { data: conv } = await supabase
    .from("convocatorias")
    .select("grupo_id, fecha")
    .eq("id", convocatoriaId)
    .maybeSingle();
  if (!conv?.grupo_id || !conv.fecha) return null;

  const { data } = await supabase
    .from("convocatorias")
    .select("id, fecha, status")
    .eq("grupo_id", conv.grupo_id)
    .lt("fecha", conv.fecha)
    .neq("status", "jugada")
    .neq("status", "cancelada")
    .order("fecha", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}
