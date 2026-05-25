"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type OneClickState = null | { error: string } | { success: string };

function mapError(code: string | undefined, fallback: string): string {
  switch (code) {
    case "P0040":
      return "Tu sesión no es de jugador.";
    case "P0041":
      return "No estás invitado a esta convocatoria.";
    case "P0042":
      return "El grupo no existe.";
    case "P0043":
      return "Este grupo está archivado.";
    case "P0044":
      return "Ya estás activo en este grupo.";
    default:
      return fallback;
  }
}

export async function declineConvocatoria(
  _prev: OneClickState,
  formData: FormData,
): Promise<OneClickState> {
  const ctx = await requireUser();
  if (ctx.profile.role !== "player") return { error: "Solo el jugador puede bajarse." };

  const convocatoriaId = String(formData.get("convocatoria_id") ?? "").trim();
  if (!convocatoriaId) return { error: "Falta el id de la convocatoria." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("player_decline_convocatoria", {
    p_convocatoria_id: convocatoriaId,
  });

  if (error) {
    return {
      error: mapError((error as { code?: string }).code, `No se pudo bajar: ${error.message}`),
    };
  }

  revalidatePath("/mi-perfil");
  return { success: "Listo, avisaste que no vas." };
}

export async function joinSuplenteQueue(
  _prev: OneClickState,
  formData: FormData,
): Promise<OneClickState> {
  const ctx = await requireUser();
  if (ctx.profile.role !== "player") return { error: "Solo el jugador puede anotarse." };

  const grupoId = String(formData.get("grupo_id") ?? "").trim();
  if (!grupoId) return { error: "Falta el id del grupo." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("player_join_suplente_queue", {
    p_grupo_id: grupoId,
  });

  if (error) {
    return {
      error: mapError((error as { code?: string }).code, `No se pudo anotar: ${error.message}`),
    };
  }

  revalidatePath("/mi-perfil");
  return { success: "Te anotaste al final de la cola." };
}
