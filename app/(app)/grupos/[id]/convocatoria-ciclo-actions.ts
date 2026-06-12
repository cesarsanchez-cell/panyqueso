"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type CicloState = null | { error: string } | { success: string };

function mapError(code: string | undefined, fallback: string): string {
  switch (code) {
    case "P0050":
      return "El grupo no existe.";
    case "P0051":
      return "El grupo está archivado.";
    case "P0052":
      return "Ya hay una convocatoria abierta para este grupo.";
    case "P0053":
      return "La convocatoria no existe.";
    case "P0055":
      return "Todavía no se cumplió el partido vigente (hora de inicio + 60 min). No se puede cerrar antes.";
    case "P0058":
      return "La fecha es anterior al día de hoy.";
    default:
      return fallback;
  }
}

export async function closeAndCreateNext(
  _prev: CicloState,
  formData: FormData,
): Promise<CicloState> {
  await requireRole(["admin", "coordinador"]);

  const grupoId = String(formData.get("grupo_id") ?? "").trim();
  const convId = String(formData.get("convocatoria_id") ?? "").trim();
  if (!convId) return { error: "Falta el id de la convocatoria." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_and_create_next_convocatoria", {
    p_convocatoria_id: convId,
  });

  if (error) {
    return {
      error: mapError(
        (error as { code?: string }).code,
        `No se pudo cerrar la convocatoria: ${error.message}`,
      ),
    };
  }

  if (grupoId) revalidatePath(`/grupos/${grupoId}`);

  return {
    success: data
      ? "Convocatoria cerrada y siguiente creada con los titulares del momento."
      : "Convocatoria cerrada (sin renovación: grupo manual o sin auto-renovar).",
  };
}
