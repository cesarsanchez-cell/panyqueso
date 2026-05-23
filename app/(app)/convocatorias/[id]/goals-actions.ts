"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type SaveGoalsState = null | { error: string } | { success: string };

function parseGoals(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return 0;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0 || n > 99) return null;
  return n;
}

const GOALS_PREFIX = "goals_";

/**
 * Guarda los goles por jugador del match asociado a una convocatoria.
 * - Admin-only.
 * - Convocatoria en 'cerrada' o 'jugada'.
 * - Upsert por (match_id, player_id). RLS bloquea DELETE, asi que jugadores
 *   sin goles quedan con goals=0 (no se borran rows).
 */
export async function saveMatchPlayerGoals(
  _prev: SaveGoalsState,
  formData: FormData,
): Promise<SaveGoalsState> {
  await requireRole("admin");

  const convocatoriaId = String(formData.get("convocatoria_id") ?? "").trim();
  if (!convocatoriaId) return { error: "Falta el id de la convocatoria." };

  const supabase = await createClient();

  const { data: conv, error: convErr } = await supabase
    .from("convocatorias")
    .select("id, status")
    .eq("id", convocatoriaId)
    .maybeSingle();

  if (convErr || !conv) return { error: "Convocatoria no encontrada." };
  if (conv.status !== "cerrada" && conv.status !== "jugada") {
    return {
      error: "Solo se pueden cargar goles si la convocatoria está cerrada o jugada.",
    };
  }

  const { data: match, error: matchErr } = await supabase
    .from("matches")
    .select("id")
    .eq("convocatoria_id", conv.id)
    .maybeSingle();

  if (matchErr || !match) return { error: "No se encontró el partido asociado." };

  // Set de player_ids validos: los que estan asignados a los teams del match.
  // Primero los team_ids del match, despues los player_ids de esos teams.
  const { data: teams, error: teamsErr } = await supabase
    .from("match_teams")
    .select("id")
    .eq("match_id", match.id);

  if (teamsErr) {
    return { error: `No se pudieron cargar los teams: ${teamsErr.message}` };
  }
  const teamIds = (teams ?? []).map((t) => t.id);
  if (teamIds.length === 0) {
    return { error: "El partido no tiene teams asignados." };
  }

  const { data: teamPlayers, error: tpErr } = await supabase
    .from("match_team_players")
    .select("player_id")
    .in("match_team_id", teamIds);

  if (tpErr) {
    return { error: `No se pudieron cargar los jugadores del partido: ${tpErr.message}` };
  }

  const validPlayerIds = new Set((teamPlayers ?? []).map((row) => row.player_id));

  if (validPlayerIds.size === 0) {
    return { error: "El partido no tiene jugadores asignados." };
  }

  // Parseamos cada goals_<playerId> del form, validando contra el set.
  const rows: Array<{ match_id: string; player_id: string; goals: number }> = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith(GOALS_PREFIX)) continue;
    const playerId = key.slice(GOALS_PREFIX.length);
    if (!validPlayerIds.has(playerId)) {
      return { error: "Jugador no pertenece a este partido." };
    }
    const goals = parseGoals(value);
    if (goals === null) {
      return { error: "Los goles deben ser enteros entre 0 y 99." };
    }
    rows.push({ match_id: match.id, player_id: playerId, goals });
  }

  if (rows.length === 0) {
    return { error: "No hay goles para guardar." };
  }

  const { error: upsertErr } = await supabase
    .from("match_player_stats")
    .upsert(rows, { onConflict: "match_id,player_id" });

  if (upsertErr) {
    return { error: `No se pudieron guardar los goles: ${upsertErr.message}` };
  }

  revalidatePath(`/convocatorias/${conv.id}`);
  return { success: "Goles guardados." };
}
