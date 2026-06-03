"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type SaveVideoState = null | { error: string } | { success: string };

const MAX_LEN = 2048;

/**
 * Guarda (o limpia) el link al video resumen del partido asociado a una
 * convocatoria.
 * - Admin-only.
 * - Convocatoria en 'cerrada' o 'jugada' (cuando ya existe el match).
 * - Solo https, hasta 2048 chars. Link vacio -> limpia (null).
 * - UPDATE directo: la RLS de matches ya es admin-only (mismo patron que goles).
 */
export async function saveMatchVideoUrl(
  _prev: SaveVideoState,
  formData: FormData,
): Promise<SaveVideoState> {
  await requireRole("admin");

  const convocatoriaId = String(formData.get("convocatoria_id") ?? "").trim();
  if (!convocatoriaId) return { error: "Falta el id de la convocatoria." };

  const raw = String(formData.get("video_resumen_url") ?? "").trim();
  let value: string | null;
  if (raw.length === 0) {
    value = null;
  } else if (!raw.startsWith("https://")) {
    return { error: "El link tiene que empezar con https://." };
  } else if (raw.length > MAX_LEN) {
    return { error: "El link es demasiado largo." };
  } else {
    value = raw;
  }

  const supabase = await createClient();

  const { data: conv, error: convErr } = await supabase
    .from("convocatorias")
    .select("id, status")
    .eq("id", convocatoriaId)
    .maybeSingle();

  if (convErr || !conv) return { error: "Convocatoria no encontrada." };
  if (conv.status !== "cerrada" && conv.status !== "jugada") {
    return {
      error: "Solo se puede cargar el video si la convocatoria está cerrada o jugada.",
    };
  }

  const { data: match, error: matchErr } = await supabase
    .from("matches")
    .select("id")
    .eq("convocatoria_id", conv.id)
    .maybeSingle();

  if (matchErr || !match) return { error: "No se encontró el partido asociado." };

  const { error: updateErr } = await supabase
    .from("matches")
    .update({ video_resumen_url: value })
    .eq("id", match.id);

  if (updateErr) {
    return { error: `No se pudo guardar el link: ${updateErr.message}` };
  }

  revalidatePath(`/convocatorias/${conv.id}`);
  return { success: value === null ? "Link quitado." : "Link del video guardado." };
}
