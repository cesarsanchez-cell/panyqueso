"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import {
  parseTeamDraft,
  promoteToGoalkeeper,
  summaryToDraft,
  swapTeam,
  type TeamDraft,
} from "@/lib/teams/draft";
import { generateTeams, type GeneratorInput } from "@/lib/teams/generate";

export type DraftMutationState = null | { error: string } | { success: string };

async function loadConvocatoriaWithDraft(
  supabase: Awaited<ReturnType<typeof createClient>>,
  convocatoriaId: string,
) {
  const { data } = await supabase
    .from("convocatorias")
    .select("status, team_draft")
    .eq("id", convocatoriaId)
    .maybeSingle();
  return data;
}

async function loadConvocadosForGenerator(
  supabase: Awaited<ReturnType<typeof createClient>>,
  convocatoriaId: string,
): Promise<GeneratorInput[]> {
  // Solo los titulares juegan el partido. Los suplentes están en cola de
  // espera por si baja un titular: NO entran al balance (evita el 7v6).
  // Tampoco entran los que declinaron.
  const { data } = await supabase
    .from("convocatoria_players")
    .select(`player:players!player_id(id, nombre, role_field, position_pref, internal_score)`)
    .eq("convocatoria_id", convocatoriaId)
    .eq("rol_en_convocatoria", "titular")
    .neq("attendance_status", "declinado");

  if (!data) return [];
  return data
    .map((cp) => cp.player)
    .filter(
      (p): p is NonNullable<typeof p> & { internal_score: number } =>
        p !== null && p.internal_score !== null,
    )
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      role_field: p.role_field,
      position_pref: p.position_pref,
      internal_score: Number(p.internal_score),
    }));
}

/**
 * Corre el algoritmo y persiste el draft. Sobrescribe el draft anterior
 * si había uno.
 */
export async function generateDraft(
  _prev: DraftMutationState,
  formData: FormData,
): Promise<DraftMutationState> {
  await requireRole("admin");

  const convocatoriaId = String(formData.get("convocatoria_id") ?? "").trim();
  if (!convocatoriaId) return { error: "Falta el id de la convocatoria." };

  const supabase = await createClient();
  const row = await loadConvocatoriaWithDraft(supabase, convocatoriaId);
  if (!row) return { error: "Convocatoria no encontrada." };
  if (row.status !== "abierta") {
    return { error: "Solo se puede generar el draft si la convocatoria está abierta." };
  }

  const convocados = await loadConvocadosForGenerator(supabase, convocatoriaId);
  if (convocados.length < 10) {
    return { error: "Se necesitan al menos 10 convocados." };
  }

  const summary = generateTeams(convocados);
  const draft = summaryToDraft(summary);

  const { error } = await supabase
    .from("convocatorias")
    .update({ team_draft: draft })
    .eq("id", convocatoriaId);

  if (error) return { error: `No se pudo guardar el draft: ${error.message}` };

  revalidatePath(`/convocatorias/${convocatoriaId}`);
  return { success: "Draft generado." };
}

/**
 * Borra el draft (vuelve a NULL). UI lo usa para "Empezar de cero".
 */
export async function clearDraft(
  _prev: DraftMutationState,
  formData: FormData,
): Promise<DraftMutationState> {
  await requireRole("admin");

  const convocatoriaId = String(formData.get("convocatoria_id") ?? "").trim();
  if (!convocatoriaId) return { error: "Falta el id de la convocatoria." };

  const supabase = await createClient();
  const row = await loadConvocatoriaWithDraft(supabase, convocatoriaId);
  if (!row) return { error: "Convocatoria no encontrada." };
  if (row.status !== "abierta") {
    return { error: "Solo se puede modificar el draft si la convocatoria está abierta." };
  }

  const { error } = await supabase
    .from("convocatorias")
    .update({ team_draft: null })
    .eq("id", convocatoriaId);

  if (error) return { error: `No se pudo limpiar el draft: ${error.message}` };

  revalidatePath(`/convocatorias/${convocatoriaId}`);
  return { success: "Draft borrado." };
}

async function updateDraftWith(
  convocatoriaId: string,
  mutate: (draft: TeamDraft) => TeamDraft,
): Promise<DraftMutationState> {
  await requireRole("admin");

  const supabase = await createClient();
  const row = await loadConvocatoriaWithDraft(supabase, convocatoriaId);
  if (!row) return { error: "Convocatoria no encontrada." };
  if (row.status !== "abierta") {
    return { error: "Solo se puede modificar el draft si la convocatoria está abierta." };
  }

  const current = parseTeamDraft(row.team_draft);
  if (!current) {
    return { error: "No hay draft cargado. Generá uno primero." };
  }

  const next = mutate(current);

  const { error } = await supabase
    .from("convocatorias")
    .update({ team_draft: next })
    .eq("id", convocatoriaId);

  if (error) return { error: `No se pudo actualizar el draft: ${error.message}` };

  revalidatePath(`/convocatorias/${convocatoriaId}`);
  return { success: "Draft actualizado." };
}

/**
 * Mueve un player al otro team. Si era GK del origen, el slot queda
 * vacío (warning en la UI).
 */
export async function swapPlayer(
  _prev: DraftMutationState,
  formData: FormData,
): Promise<DraftMutationState> {
  const convocatoriaId = String(formData.get("convocatoria_id") ?? "").trim();
  const playerId = String(formData.get("player_id") ?? "").trim();
  if (!convocatoriaId || !playerId) return { error: "Faltan datos." };

  return updateDraftWith(convocatoriaId, (draft) => swapTeam(draft, playerId));
}

/**
 * Hace al player GK del team en el que está. Si había un GK, baja a
 * jugador normal del mismo team.
 */
export async function promotePlayerToGoalkeeper(
  _prev: DraftMutationState,
  formData: FormData,
): Promise<DraftMutationState> {
  const convocatoriaId = String(formData.get("convocatoria_id") ?? "").trim();
  const playerId = String(formData.get("player_id") ?? "").trim();
  if (!convocatoriaId || !playerId) return { error: "Faltan datos." };

  return updateDraftWith(convocatoriaId, (draft) => promoteToGoalkeeper(draft, playerId));
}
