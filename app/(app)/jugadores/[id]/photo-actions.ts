"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createServiceClient } from "@/lib/supabase/service";

export type AdminPhotoState = null | { error: string } | { success: string };

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const BUCKET = "player-photos";

/**
 * El admin sube/reemplaza la foto de un jugador (para quienes no se manejan con
 * la app). Admin-only. Misma logica que la subida self-service del jugador pero
 * con el player_id explicito. Storage + UPDATE van con cliente service-role.
 */
export async function uploadPlayerPhoto(
  _prev: AdminPhotoState,
  formData: FormData,
): Promise<AdminPhotoState> {
  await requireRole("admin");

  const playerId = String(formData.get("player_id") ?? "").trim();
  if (!playerId) return { error: "Falta el jugador." };

  const file = formData.get("foto");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Elegí una imagen." };
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return { error: "Formato no soportado. Usá JPG, PNG o WEBP." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "La imagen es muy grande (máximo 8 MB)." };
  }

  const svc = createServiceClient();

  const { error: uploadErr } = await svc.storage
    .from(BUCKET)
    .upload(playerId, file, { upsert: true, contentType: file.type });
  if (uploadErr) {
    return { error: `No se pudo subir la foto: ${uploadErr.message}` };
  }

  const { url } = getSupabaseEnv();
  const publicUrl = `${url}/storage/v1/object/public/${BUCKET}/${playerId}?v=${Date.now()}`;

  const { error: updateErr } = await svc
    .from("players")
    .update({ avatar_url: publicUrl })
    .eq("id", playerId);
  if (updateErr) {
    return { error: `No se pudo guardar la foto: ${updateErr.message}` };
  }

  revalidatePath(`/jugadores/${playerId}`);
  return { success: "Foto actualizada." };
}
