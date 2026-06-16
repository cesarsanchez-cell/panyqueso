"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type CoordinadorState = null | { error: string } | { success: string };

/**
 * El admin otorga el rango de coordinador a un miembro y lo vincula al grupo, en
 * un solo paso. El RPC asignar_coordinador_a_grupo setea profiles.role y crea la
 * fila en coordinador_grupos (antes el rol se seteaba a mano en Supabase).
 */
export async function assignCoordinador(
  _prev: CoordinadorState,
  formData: FormData,
): Promise<CoordinadorState> {
  await requireRole("admin");

  const grupoId = String(formData.get("grupo_id") ?? "").trim();
  const profileId = String(formData.get("profile_id") ?? "").trim();
  if (!grupoId) return { error: "Falta el grupo." };
  if (!profileId) return { error: "Elegí un coordinador." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("asignar_coordinador_a_grupo", {
    p_profile_id: profileId,
    p_grupo_id: grupoId,
  });

  if (error) {
    // P0090 = la persona ya es admin o veedor (rango excluyente).
    if (error.code === "P0090") {
      return { error: "Esa persona ya es admin o veedor. Quitale ese rango primero." };
    }
    return { error: "No se pudo asignar. Probá de nuevo." };
  }

  revalidatePath(`/grupos/${grupoId}`);
  return { success: "Coordinador asignado." };
}

/**
 * El admin desasigna un coordinador del grupo. El RPC quita la vinculación y, si
 * era su último grupo, le baja el rango (vuelve a 'player' si es jugador).
 */
export async function unassignCoordinador(formData: FormData): Promise<void> {
  await requireRole("admin");

  const id = String(formData.get("coordinador_grupo_id") ?? "").trim();
  const grupoId = String(formData.get("grupo_id") ?? "").trim();
  if (!id) return;

  const supabase = await createClient();
  await supabase.rpc("quitar_coordinador_de_grupo", { p_coordinador_grupo_id: id });

  if (grupoId) revalidatePath(`/grupos/${grupoId}`);
}
