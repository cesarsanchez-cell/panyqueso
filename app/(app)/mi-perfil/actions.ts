"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-role";
import { notifyOpenSpot } from "@/lib/push/actions";
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
      return "No estás en el grupo de esta convocatoria.";
    case "P0050":
      return "El grupo no existe.";
    case "P0053":
      return "La convocatoria no existe.";
    case "P0057":
      return "La convocatoria ya no está abierta. Si necesitás un cambio, hablalo con el organizador.";
    case "P0059":
      return "Ya estás en esta convocatoria.";
    case "P0071":
      return "Los equipos ya están armados y la lista quedó cerrada. Cualquier cosa, hablá con el coordinador / admin.";
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

  // Best-effort: si se liberó un lugar de titular, avisamos al grupo. Nunca
  // rompe la baja (notifyOpenSpot no lanza).
  await notifyOpenSpot(convocatoriaId);

  return { success: "Listo, avisaste que no vas." };
}

export async function undoDeclineConvocatoria(
  _prev: OneClickState,
  formData: FormData,
): Promise<OneClickState> {
  const ctx = await requireUser();
  if (ctx.profile.role !== "player") return { error: "Solo el jugador puede retractarse." };

  const convocatoriaId = String(formData.get("convocatoria_id") ?? "").trim();
  if (!convocatoriaId) return { error: "Falta el id de la convocatoria." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("player_undo_decline_convocatoria", {
    p_convocatoria_id: convocatoriaId,
  });

  if (error) {
    return {
      error: mapError((error as { code?: string }).code, `No se pudo retractar: ${error.message}`),
    };
  }

  revalidatePath("/mi-perfil");
  return { success: "Listo, volviste a la convocatoria." };
}

export async function joinOpenConvocatoria(
  _prev: OneClickState,
  formData: FormData,
): Promise<OneClickState> {
  const ctx = await requireUser();
  if (ctx.profile.role !== "player") return { error: "Solo el jugador puede anotarse." };

  const convocatoriaId = String(formData.get("convocatoria_id") ?? "").trim();
  if (!convocatoriaId) return { error: "Falta el id de la convocatoria." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("player_join_open_convocatoria", {
    p_convocatoria_id: convocatoriaId,
  });

  if (error) {
    return {
      error: mapError((error as { code?: string }).code, `No se pudo anotar: ${error.message}`),
    };
  }

  revalidatePath("/mi-perfil");
  return {
    success: data === "titular" ? "Entraste como titular." : "Entraste a la lista de espera.",
  };
}

// El jugador se baja del GRUPO (distinto de bajarse de una convocatoria). La
// membresía pasa a inactivo y el trigger lo saca de la convocatoria abierta.
// Volver a entrar lo decide el coord/admin (no hay auto-reenganche).
export async function leaveGrupo(_prev: OneClickState, formData: FormData): Promise<OneClickState> {
  await requireUser();

  const grupoId = String(formData.get("grupo_id") ?? "").trim();
  if (!grupoId) return { error: "Falta el id del grupo." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("player_leave_grupo", { p_grupo_id: grupoId });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("not_active_member")) return { error: "Ya no sos miembro de este grupo." };
    if (msg.includes("no_player_ficha")) return { error: "Tu cuenta no tiene ficha de jugador." };
    return { error: `No se pudo bajar del grupo: ${msg}` };
  }

  revalidatePath("/mi-perfil");
  return { success: "Te bajaste del grupo." };
}
