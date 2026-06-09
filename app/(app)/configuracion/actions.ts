"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type GateState = null | { error: string } | { success: string; value: boolean };

/**
 * Veedor opcional: el admin activa/desactiva el gate del veedor para los
 * cambios de rating (alta + edición). Llama a set_requiere_veedor (SECURITY
 * DEFINER, audita el cambio). Solo admin (requireRole + P0013 en la DB).
 */
export async function setVeedorGate(_prev: GateState, formData: FormData): Promise<GateState> {
  await requireRole("admin");

  const value = formData.get("value") === "true";

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_requiere_veedor", { p_value: value });

  if (error) {
    const friendly =
      error.code === "P0013" ? "Solo un admin puede cambiar esta configuración." : error.message;
    return { error: `No se pudo guardar: ${friendly}` };
  }

  revalidatePath("/configuracion");
  revalidatePath("/");

  return {
    success: value
      ? "Listo: ahora los cambios de ratings los aprueba el veedor."
      : "Listo: ahora el admin aplica los cambios de ratings directo.",
    value,
  };
}
