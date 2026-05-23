"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Winner = Database["public"]["Enums"]["match_winner"];

export type SaveResultState = null | { error: string } | { success: string };

function parseScore(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 99) return null;
  return n;
}

function computeWinner(scoreA: number, scoreB: number): Winner {
  if (scoreA > scoreB) return "a";
  if (scoreB > scoreA) return "b";
  return "empate";
}

/**
 * Carga / actualiza el resultado del match asociado a una convocatoria.
 * - Admin-only.
 * - La convocatoria puede estar 'cerrada' (carga inicial) o 'jugada'
 *   (re-edicion permitida; el match es el mismo, solo se actualiza el
 *   resultado).
 * - Transiciona convocatoria a 'jugada' en la primera carga.
 */
export async function saveMatchResult(
  _prev: SaveResultState,
  formData: FormData,
): Promise<SaveResultState> {
  await requireRole("admin");

  const convocatoriaId = String(formData.get("convocatoria_id") ?? "").trim();
  if (!convocatoriaId) return { error: "Falta el id de la convocatoria." };

  const scoreA = parseScore(formData.get("score_team_a"));
  const scoreB = parseScore(formData.get("score_team_b"));
  if (scoreA === null || scoreB === null) {
    return { error: "Los scores deben ser enteros entre 0 y 99." };
  }

  const notasRaw = String(formData.get("notas") ?? "").trim();
  if (notasRaw.length > 500) {
    return { error: "Notas demasiado largas (máximo 500 caracteres)." };
  }
  const notas = notasRaw.length > 0 ? notasRaw : null;

  const winner = computeWinner(scoreA, scoreB);

  const supabase = await createClient();

  // Validar convocatoria + obtener el match asociado.
  const { data: conv, error: convErr } = await supabase
    .from("convocatorias")
    .select("id, status")
    .eq("id", convocatoriaId)
    .maybeSingle();

  if (convErr || !conv) return { error: "Convocatoria no encontrada." };
  if (conv.status !== "cerrada" && conv.status !== "jugada") {
    return {
      error: "Solo se puede cargar resultado si la convocatoria está cerrada o jugada.",
    };
  }

  const { data: match, error: matchErr } = await supabase
    .from("matches")
    .select("id")
    .eq("convocatoria_id", conv.id)
    .maybeSingle();

  if (matchErr || !match) return { error: "No se encontró el partido asociado." };

  // UPDATE matches con los scores.
  const { error: updMatchErr } = await supabase
    .from("matches")
    .update({
      score_team_a: scoreA,
      score_team_b: scoreB,
      winner,
      notas,
    })
    .eq("id", match.id);

  if (updMatchErr) {
    return { error: `No se pudo guardar el resultado: ${updMatchErr.message}` };
  }

  // Si la convocatoria sigue en 'cerrada', la transicionamos a 'jugada'.
  if (conv.status === "cerrada") {
    const { error: updConvErr } = await supabase
      .from("convocatorias")
      .update({ status: "jugada" })
      .eq("id", conv.id);

    if (updConvErr) {
      // El match ya quedo con resultado; la transicion fallo. Reportamos
      // pero no rollbackeamos porque el resultado en si es valido.
      return {
        error: `Resultado guardado, pero la convocatoria no pasó a "jugada": ${updConvErr.message}`,
      };
    }
  }

  revalidatePath(`/convocatorias/${conv.id}`);
  revalidatePath("/convocatorias");
  return { success: "Resultado guardado." };
}
