"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-role";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export type PhotoState = null | { error: string } | { success: string };

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const BUCKET = "player-photos";

/**
 * Sube/reemplaza la foto de perfil del jugador autenticado.
 * - El jugador identifica su propia ficha vía get_my_player_summary (SECURITY
 *   DEFINER); no puede tocar la de otro.
 * - Storage + UPDATE de players.avatar_url van con cliente service-role porque
 *   el rol player no tiene GRANT sobre avatar_url ni escritura en el bucket.
 * - Solo imágenes (jpg/png/webp), hasta 5 MB.
 */
export async function uploadMyPhoto(_prev: PhotoState, formData: FormData): Promise<PhotoState> {
  await requireUser();

  const file = formData.get("foto");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Elegí una imagen." };
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return { error: "Formato no soportado. Usá JPG, PNG o WEBP." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "La imagen es muy grande (máximo 5 MB)." };
  }

  // ¿Quién soy? (su propia ficha de jugador).
  const supabase = await createClient();
  const { data: rows } = await supabase.rpc("get_my_player_summary");
  const player = rows && rows.length > 0 ? rows[0] : null;
  if (!player) {
    return { error: "No encontramos tu ficha de jugador." };
  }

  const svc = createServiceClient();

  // Un objeto por jugador (se sobreescribe en cada cambio).
  const { error: uploadErr } = await svc.storage
    .from(BUCKET)
    .upload(player.id, file, { upsert: true, contentType: file.type });
  if (uploadErr) {
    return { error: `No se pudo subir la foto: ${uploadErr.message}` };
  }

  // URL pública + cache-bust para que el navegador tome la nueva imagen.
  const { url } = getSupabaseEnv();
  const publicUrl = `${url}/storage/v1/object/public/${BUCKET}/${player.id}?v=${Date.now()}`;

  const { error: updateErr } = await svc
    .from("players")
    .update({ avatar_url: publicUrl })
    .eq("id", player.id);
  if (updateErr) {
    return { error: `No se pudo guardar la foto: ${updateErr.message}` };
  }

  revalidatePath("/perfil");
  revalidatePath("/mi-perfil");
  return { success: "Foto actualizada." };
}
