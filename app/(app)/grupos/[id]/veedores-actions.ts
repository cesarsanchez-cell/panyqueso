"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type VeedorGrupoState = null | { error: string } | { success: string };

/**
 * El admin o el coordinador del grupo asigna a un miembro como veedor de ESTE
 * grupo. El RPC asignar_veedor_a_grupo otorga la marca veedor y crea la fila en
 * veedor_grupos. Con un veedor asignado, los cambios de rating del grupo pasan a
 * necesitar su aprobación.
 */
export async function assignVeedor(
  _prev: VeedorGrupoState,
  formData: FormData,
): Promise<VeedorGrupoState> {
  await requireRole(["admin", "coordinador"]);

  const grupoId = String(formData.get("grupo_id") ?? "").trim();
  const profileId = String(formData.get("profile_id") ?? "").trim();
  if (!grupoId) return { error: "Falta el grupo." };
  if (!profileId) return { error: "Elegí un veedor." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("asignar_veedor_a_grupo", {
    p_profile_id: profileId,
    p_grupo_id: grupoId,
  });

  if (error) {
    // P0090 = la persona ya es admin o coordinador (rango excluyente).
    if (error.code === "P0090") {
      return { error: "Esa persona ya es admin o coordinador. Quitale ese rango primero." };
    }
    return { error: "No se pudo asignar. Probá de nuevo." };
  }

  revalidatePath(`/grupos/${grupoId}`);
  return { success: "Veedor asignado." };
}

/**
 * El admin o el coordinador del grupo desasigna un veedor. El RPC quita la
 * vinculación y, si era su último grupo, le baja la marca (vuelve a 'player').
 */
export async function unassignVeedor(formData: FormData): Promise<void> {
  await requireRole(["admin", "coordinador"]);

  const id = String(formData.get("veedor_grupo_id") ?? "").trim();
  const grupoId = String(formData.get("grupo_id") ?? "").trim();
  if (!id) return;

  const supabase = await createClient();
  await supabase.rpc("quitar_veedor_de_grupo", { p_veedor_grupo_id: id });

  if (grupoId) revalidatePath(`/grupos/${grupoId}`);
}
