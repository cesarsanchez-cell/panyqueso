"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type CoordinadorState = null | { error: string } | { success: string };

/**
 * El admin asigna un profile (con rol 'coordinador') como gestor de un grupo.
 * Crea la fila en coordinador_grupos. El rol del profile se setea en Supabase
 * (igual que admin/veedor); acá solo se vincula al grupo.
 */
export async function assignCoordinador(
  _prev: CoordinadorState,
  formData: FormData,
): Promise<CoordinadorState> {
  const { userId } = await requireRole("admin");

  const grupoId = String(formData.get("grupo_id") ?? "").trim();
  const profileId = String(formData.get("profile_id") ?? "").trim();
  if (!grupoId) return { error: "Falta el grupo." };
  if (!profileId) return { error: "Elegí un coordinador." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("coordinador_grupos")
    .insert({ grupo_id: grupoId, profile_id: profileId, created_by: userId });

  if (error) {
    // 23505 = ya estaba asignado a este grupo.
    if (error.code === "23505") return { error: "Ese coordinador ya gestiona este grupo." };
    return { error: "No se pudo asignar. Probá de nuevo." };
  }

  revalidatePath(`/grupos/${grupoId}`);
  return { success: "Coordinador asignado." };
}

/** El admin desasigna un coordinador del grupo (borra la fila). */
export async function unassignCoordinador(formData: FormData): Promise<void> {
  await requireRole("admin");

  const id = String(formData.get("coordinador_grupo_id") ?? "").trim();
  const grupoId = String(formData.get("grupo_id") ?? "").trim();
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("coordinador_grupos").delete().eq("id", id);

  if (grupoId) revalidatePath(`/grupos/${grupoId}`);
}
