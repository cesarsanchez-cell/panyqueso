"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type CoefState = null | { error: string } | { success: string };

function parseCoef(raw: FormDataEntryValue | null, min: number, max: number): number | null {
  const n = Number(String(raw ?? "").trim());
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  // Redondeo a 2 decimales (numeric(4,2) en la DB).
  return Math.round(n * 100) / 100;
}

/**
 * FUT-127: el admin ajusta los coeficientes de liderazgo: positivo (≥1.00,
 * potencia) y negativo (≤1.00, penaliza). 1.00 = sin efecto. La RPC valida que
 * sea admin (P0013) y audita.
 */
export async function updateLiderazgoCoefs(
  _prev: CoefState,
  formData: FormData,
): Promise<CoefState> {
  await requireRole(["admin"]);

  const positivo = parseCoef(formData.get("liderazgo_coef_positivo"), 1, 5);
  const negativo = parseCoef(formData.get("liderazgo_coef_negativo"), 0.1, 1);
  if (positivo === null) {
    return { error: "El coeficiente positivo tiene que ser un número entre 1.00 y 5.00." };
  }
  if (negativo === null) {
    return { error: "El coeficiente negativo tiene que ser un número entre 0.10 y 1.00." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_liderazgo_coeficientes", {
    p_positivo: positivo,
    p_negativo: negativo,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("not_an_admin")) return { error: "No tenés permiso para este cambio." };
    if (msg.includes("coef_fuera_de_rango"))
      return { error: "Coeficientes fuera de rango (positivo 1.00–5.00, negativo 0.10–1.00)." };
    return { error: `No se pudo guardar: ${msg}` };
  }

  revalidatePath("/configuracion");
  return { success: "Coeficientes de liderazgo actualizados." };
}
