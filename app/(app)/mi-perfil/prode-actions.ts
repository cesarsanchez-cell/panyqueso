"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type ProdeState = null | { error: string } | { success: string };

function parseScore(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string") return null;
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < 0 || n > 99) return null;
  return n;
}

/**
 * El jugador logueado (miembro activo del grupo) carga o edita su pronóstico
 * del resultado. Toda la validación (es miembro, la ventana está abierta) vive
 * en la RPC cast_prode_prediction (SECURITY DEFINER). Acá solo mapeamos los
 * errores conocidos a un mensaje claro.
 */
export async function castProdePrediction(
  _prev: ProdeState,
  formData: FormData,
): Promise<ProdeState> {
  await requireUser();

  const matchId = String(formData.get("match_id") ?? "").trim();
  const scoreA = parseScore(formData.get("score_a"));
  const scoreB = parseScore(formData.get("score_b"));
  if (!matchId) return { error: "Falta el partido." };
  if (scoreA === null || scoreB === null) {
    return { error: "Poné un resultado válido (0 a 99 para cada equipo)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cast_prode_prediction", {
    p_match_id: matchId,
    p_score_a: scoreA,
    p_score_b: scoreB,
  });

  if (error) {
    const m = error.message;
    if (m.includes("prode_closed")) return { error: "El Prode de este partido ya cerró." };
    if (m.includes("not_group_member")) return { error: "Solo pueden pronosticar los del grupo." };
    if (m.includes("invalid_score")) return { error: "Poné un resultado válido (0 a 99)." };
    return { error: "No se pudo guardar tu pronóstico. Probá de nuevo." };
  }

  revalidatePath("/mi-perfil");
  return { success: "¡Pronóstico guardado!" };
}
