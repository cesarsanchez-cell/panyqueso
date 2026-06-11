"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type PremioPinochoState = null | { error: string } | { success: string; value: boolean };

/**
 * El admin prende/apaga el premio 🪵 Pinocho (peor jugador) de un grupo. Es
 * opt-in (default apagado) porque es un voto negativo: cada grupo decide.
 */
export async function setPremioPinocho(
  _prev: PremioPinochoState,
  formData: FormData,
): Promise<PremioPinochoState> {
  await requireRole("admin");

  const grupoId = String(formData.get("grupo_id") ?? "").trim();
  const value = String(formData.get("value") ?? "") === "true";
  if (!grupoId) return { error: "Falta el grupo." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("grupos")
    .update({ premio_pinocho: value })
    .eq("id", grupoId);

  if (error) return { error: "No se pudo guardar. Probá de nuevo." };

  revalidatePath(`/grupos/${grupoId}`);
  return {
    success: value ? "Premio Pinocho activado." : "Premio Pinocho desactivado.",
    value,
  };
}
