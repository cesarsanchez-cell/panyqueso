"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type CoefState = null | { error: string } | { success: string };

function parseCoef(raw: FormDataEntryValue | null): number | null {
  const n = Number(String(raw ?? "").trim());
  if (!Number.isFinite(n)) return null;
  // Mismo rango que el check de la DB (set_liderazgo_coeficientes / app_settings).
  if (n < 1 || n > 5) return null;
  // Redondeo a 2 decimales (numeric(4,2) en la DB).
  return Math.round(n * 100) / 100;
}

/**
 * FUT-127: el admin ajusta los coeficientes de potenciación por líder
 * (medio/alto). 1.00 = sin efecto. La RPC valida que sea admin (P0013) y audita.
 */
export async function updateLiderazgoCoefs(
  _prev: CoefState,
  formData: FormData,
): Promise<CoefState> {
  await requireRole(["admin"]);

  const medio = parseCoef(formData.get("liderazgo_coef_medio"));
  const alto = parseCoef(formData.get("liderazgo_coef_alto"));
  if (medio === null || alto === null) {
    return { error: "Los coeficientes tienen que ser números entre 1.00 y 5.00." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_liderazgo_coeficientes", {
    p_medio: medio,
    p_alto: alto,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("not_an_admin")) return { error: "No tenés permiso para este cambio." };
    if (msg.includes("coef_fuera_de_rango"))
      return { error: "Los coeficientes tienen que estar entre 1.00 y 5.00." };
    return { error: `No se pudo guardar: ${msg}` };
  }

  revalidatePath("/configuracion");
  return { success: "Coeficientes de liderazgo actualizados." };
}
