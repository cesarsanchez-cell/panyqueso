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
import {
  generateTeamsWithVariety,
  type GeneratorInput,
  type PreviousComposition,
} from "@/lib/teams/generate";

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
 * FUT-87: composición (equipos por id) del último partido pasado del grupo
 * al que pertenece esta convocatoria. Sirve para que el generador evite
 * repetir los mismos equipos semana a semana. Devuelve null si el grupo no
 * tuvo partidos previos (primera fecha).
 */
async function loadPreviousComposition(
  supabase: Awaited<ReturnType<typeof createClient>>,
  convocatoriaId: string,
): Promise<PreviousComposition | null> {
  const { data: conv } = await supabase
    .from("convocatorias")
    .select("grupo_id")
    .eq("id", convocatoriaId)
    .maybeSingle();
  if (!conv?.grupo_id) return null;

  const { data: convs } = await supabase
    .from("convocatorias")
    .select("id")
    .eq("grupo_id", conv.grupo_id);
  const convIds = (convs ?? []).map((c) => c.id);
  if (convIds.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);
  const { data: lastMatch } = await supabase
    .from("matches")
    .select("id")
    .in("convocatoria_id", convIds)
    .lt("fecha", today)
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lastMatch?.id) return null;

  const { data: teams } = await supabase
    .from("match_teams")
    .select("id, team_label, players:match_team_players(player_id)")
    .eq("match_id", lastMatch.id);
  if (!teams || teams.length === 0) return null;

  const composition: PreviousComposition = { teamA: [], teamB: [] };
  for (const t of teams) {
    const ids = (t.players ?? [])
      .map((p) => p.player_id)
      .filter((id): id is string => typeof id === "string");
    if (t.team_label === "A") composition.teamA.push(...ids);
    else if (t.team_label === "B") composition.teamB.push(...ids);
  }
  if (composition.teamA.length === 0 && composition.teamB.length === 0) return null;
  return composition;
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

  // FUT-87: variedad vs la fecha anterior del grupo (best-effort: si no hay
  // partido previo, el generador cae al mejor balance sin más).
  const previous = await loadPreviousComposition(supabase, convocatoriaId);
  const summary = generateTeamsWithVariety(convocados, { previous });
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
