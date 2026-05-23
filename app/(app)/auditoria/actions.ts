"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type DecisionState = null | { success: string } | { error: string };

// Mapeo de SQLSTATE custom (P0001..P0008) a mensajes accionables.
const FRIENDLY_BY_SQLSTATE: Record<string, string> = {
  P0001: "No hay sesión activa. Refrescá la página.",
  P0002: "La solicitud no existe (puede haber sido eliminada).",
  P0003: "Solo veedores pueden decidir solicitudes.",
  P0004: "Esta solicitud ya fue decidida.",
  P0005: "No podés actuar sobre una solicitud que vos propusiste.",
  P0006: "El jugador asociado a la solicitud no existe.",
  P0007: "El jugador cambió entre que se propuso y ahora. Refrescá y revisá.",
  P0008: "Tipo de acción desconocido.",
};

type Decision = "approve" | "reject" | "flag";

function parseDecision(raw: FormDataEntryValue | null): Decision | null {
  if (raw === "approve" || raw === "reject" || raw === "flag") return raw;
  return null;
}

export async function decideRequest(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  await requireRole("veedor");

  const decision = parseDecision(formData.get("decision"));
  if (!decision) return { error: "Acción inválida." };

  const requestId = String(formData.get("request_id") ?? "").trim();
  if (!requestId) return { error: "Falta el id de la solicitud." };

  const comment = String(formData.get("comment") ?? "").trim();
  if ((decision === "reject" || decision === "flag") && !comment) {
    return { error: "El comentario es obligatorio para rechazar o flag-ear." };
  }

  const supabase = await createClient();
  // Las 3 funciones SECURITY DEFINER tienen la misma firma (p_request_id, p_comment).
  // Hacemos branching para que el RPC name sea un literal y supabase-js valide
  // tipos contra los Database types regenerados.
  const args = { p_request_id: requestId, p_comment: comment || undefined };
  const { error } =
    decision === "approve"
      ? await supabase.rpc("approve_player_change_request", args)
      : decision === "reject"
        ? await supabase.rpc("reject_player_change_request", args)
        : await supabase.rpc("flag_player_change_request", args);

  if (error) {
    const friendly = error.code ? FRIENDLY_BY_SQLSTATE[error.code] : null;
    return { error: friendly ?? `No se pudo procesar: ${error.message}` };
  }

  // Revalidar:
  //  - /auditoria (la lista cambia).
  //  - / (layout calcula el badge de pendientes; ver Fase 4 PR 1).
  //  - /auditoria/[id] (ruta de detalle: PR 4 la crea, ahora ya queda revalidada).
  revalidatePath("/auditoria");
  revalidatePath("/");
  revalidatePath(`/auditoria/${requestId}`);

  const successMsg =
    decision === "approve"
      ? "Solicitud aprobada."
      : decision === "reject"
        ? "Solicitud rechazada."
        : "Solicitud marcada para revisión.";
  return { success: successMsg };
}
