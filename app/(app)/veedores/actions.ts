"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type VeedorState = null | { error: string } | { success: string };

/**
 * El admin otorga o quita el rango de veedor (global) a un jugador. El RPC
 * set_veedor setea profiles.role y aplica las barreras (no a uno mismo, no a un
 * admin, no a un coordinador sin sacarle antes la coordinación).
 */
export async function setVeedor(_prev: VeedorState, formData: FormData): Promise<VeedorState> {
  await requireRole("admin");

  const profileId = String(formData.get("profile_id") ?? "").trim();
  const esVeedor = String(formData.get("value") ?? "") === "true";
  if (!profileId) return { error: "Falta la persona." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_veedor", {
    p_profile_id: profileId,
    p_es_veedor: esVeedor,
  });

  if (error) {
    if (error.code === "P0091") return { error: "No podés cambiarte tu propio rango." };
    if (error.code === "P0092") return { error: "No podés tocar el rango de un admin." };
    if (error.code === "P0093") {
      return { error: "Esa persona es coordinadora. Quitale la coordinación primero." };
    }
    return { error: "No se pudo aplicar. Probá de nuevo." };
  }

  revalidatePath("/veedores");
  return { success: esVeedor ? "Listo, ahora es veedor." : "Listo, ya no es veedor." };
}
