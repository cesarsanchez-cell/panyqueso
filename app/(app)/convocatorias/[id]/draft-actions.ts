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
import { generateTeamsWithVariety, type GeneratorInput } from "@/lib/teams/generate";
import { loadGroupRatings } from "@/lib/teams/group-ratings";
import { loadLeaderCoefs } from "@/lib/teams/leader-coefs";
import { loadPreviousComposition } from "@/lib/teams/previous";

export type DraftMutationState = null | { error: string } | { success: string };

async function loadConvocatoriaWithDraft(
  supabase: Awaited<ReturnType<typeof createClient>>,
  convocatoriaId: string,
) {
  const { data } = await supabase
    .from("convocatorias")
    .select("status, team_draft, modo, grupo_id")
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
  // FUT-95: además del score, traemos las dimensiones (físico/mental/técnica),
  // la edad (para el físico efectivo) y positions_possible (arquero alternativo)
  // para el balance por rubro.
  // FUT-103/105: si la convocatoria es de un grupo, el rating (score + dims +
  // rol/posición) sale del rating POR GRUPO; la base de players queda como
  // semilla. La edad es global (no difiere por grupo).
  const { data: conv } = await supabase
    .from("convocatorias")
    .select("grupo_id")
    .eq("id", convocatoriaId)
    .maybeSingle();
  const grupoId = conv?.grupo_id ?? null;

  const { data } = await supabase
    .from("convocatoria_players")
    .select(
      `player:players!player_id(id, nombre, role_field, position_pref, internal_score,
         physical, mental, technical, edad, positions_possible)`,
    )
    .eq("convocatoria_id", convocatoriaId)
    .eq("rol_en_convocatoria", "titular")
    .neq("attendance_status", "declinado");

  if (!data) return [];

  const base = data
    .map((cp) => cp.player)
    .filter(
      (p): p is NonNullable<typeof p> & { internal_score: number } =>
        p !== null && p.internal_score !== null,
    );

  const overrides = await loadGroupRatings(
    supabase,
    grupoId,
    base.map((p) => p.id),
  );

  return base.map((p) => {
    const g = overrides.get(p.id);
    return {
      id: p.id,
      nombre: p.nombre,
      role_field: g?.role_field ?? p.role_field,
      position_pref: g?.position_pref ?? p.position_pref,
      internal_score: g ? g.internal_score : Number(p.internal_score),
      physical: g?.physical ?? p.physical ?? undefined,
      mental: g?.mental ?? p.mental ?? undefined,
      technical: g?.technical ?? p.technical ?? undefined,
      edad: p.edad ?? undefined,
      positions_possible: g?.positions_possible ?? p.positions_possible ?? undefined,
      // FUT-127: el liderazgo es por grupo; sin override (convocatoria suelta)
      // queda 'ninguno' y no potencia nada.
      liderazgo: g?.liderazgo ?? "ninguno",
    };
  });
}

/**
 * Corre el algoritmo y persiste el draft. Sobrescribe el draft anterior
 * si había uno.
 */
export async function generateDraft(
  _prev: DraftMutationState,
  formData: FormData,
): Promise<DraftMutationState> {
  await requireRole(["admin", "coordinador"]);

  const convocatoriaId = String(formData.get("convocatoria_id") ?? "").trim();
  if (!convocatoriaId) return { error: "Falta el id de la convocatoria." };

  const supabase = await createClient();
  const row = await loadConvocatoriaWithDraft(supabase, convocatoriaId);
  if (!row) return { error: "Convocatoria no encontrada." };
  if (row.modo === "presentismo") {
    return {
      error: "Este grupo arma los equipos en la cancha. Entrá a “Ir a la cancha” desde el grupo.",
    };
  }
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
  const coefs = await loadLeaderCoefs(supabase);
  const summary = generateTeamsWithVariety(convocados, { previous }, coefs);
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
  await requireRole(["admin", "coordinador"]);

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
  await requireRole(["admin", "coordinador"]);

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
