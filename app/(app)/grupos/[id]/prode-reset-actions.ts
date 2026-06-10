"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type ResetProdeState = null | { error: string } | { success: string };

/**
 * El admin resetea (borra) los pronósticos del Prode de un grupo en un año.
 * La autorización vive también en la RPC admin_reset_prode (SECURITY DEFINER).
 */
export async function resetProde(
  _prev: ResetProdeState,
  formData: FormData,
): Promise<ResetProdeState> {
  await requireRole("admin");

  const grupoId = String(formData.get("grupo_id") ?? "").trim();
  const year = Number(formData.get("year"));
  if (!grupoId || !Number.isInteger(year)) return { error: "Datos inválidos." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_reset_prode", {
    p_grupo_id: grupoId,
    p_year: year,
  });

  if (error) {
    if (error.message.includes("forbidden")) return { error: "No autorizado." };
    return { error: "No se pudo resetear el Prode. Probá de nuevo." };
  }

  revalidatePath(`/grupos/${grupoId}`);
  return { success: `Prode ${year} reseteado: ${data ?? 0} pronósticos borrados.` };
}
