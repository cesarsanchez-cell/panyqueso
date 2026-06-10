"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type SaveGoalsState = null | { error: string } | { success: string };

function parseStat(raw: FormDataEntryValue | undefined): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return 0;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0 || n > 99) return null;
  return n;
}

const GOALS_PREFIX = "goals_";
const ASSISTS_PREFIX = "asist_";
const OWN_GOALS_PREFIX = "contra_";

/**
 * Guarda los goles, asistencias (pases de gol) y goles en contra (autogoles)
 * por jugador del match asociado a una convocatoria.
 * - Admin-only.
 * - Convocatoria en 'cerrada' o 'jugada'.
 * - Upsert por (match_id, player_id). RLS bloquea DELETE, asi que jugadores
 *   sin stats quedan con goals=0 / asistencias=0 (no se borran rows).
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

  // Juntamos goles, asistencias y goles en contra por jugador
  // (goals_<id> / asist_<id> / contra_<id>), validando cada playerId contra el
  // set del partido.
  const byPlayer = new Map<string, { goals: number; asistencias: number; own_goals: number }>();
  for (const [key, value] of formData.entries()) {
    let playerId: string | null = null;
    let field: "goals" | "asistencias" | "own_goals" | null = null;
    if (key.startsWith(GOALS_PREFIX)) {
      playerId = key.slice(GOALS_PREFIX.length);
      field = "goals";
    } else if (key.startsWith(ASSISTS_PREFIX)) {
      playerId = key.slice(ASSISTS_PREFIX.length);
      field = "asistencias";
    } else if (key.startsWith(OWN_GOALS_PREFIX)) {
      playerId = key.slice(OWN_GOALS_PREFIX.length);
      field = "own_goals";
    }
    if (!playerId || !field) continue;

    if (!validPlayerIds.has(playerId)) {
      return { error: "Jugador no pertenece a este partido." };
    }
    const parsed = parseStat(value);
    if (parsed === null) {
      return { error: "Goles, asistencias y goles en contra deben ser enteros entre 0 y 99." };
    }
    const entry = byPlayer.get(playerId) ?? { goals: 0, asistencias: 0, own_goals: 0 };
    entry[field] = parsed;
    byPlayer.set(playerId, entry);
  }

  const rows = Array.from(byPlayer.entries()).map(([player_id, stats]) => ({
    match_id: match.id,
    player_id,
    goals: stats.goals,
    asistencias: stats.asistencias,
    own_goals: stats.own_goals,
  }));

  if (rows.length === 0) {
    return { error: "No hay stats para guardar." };
  }

  const { error: upsertErr } = await supabase
    .from("match_player_stats")
    .upsert(rows, { onConflict: "match_id,player_id" });

  if (upsertErr) {
    return { error: `No se pudieron guardar los goles y asistencias: ${upsertErr.message}` };
  }

  revalidatePath(`/convocatorias/${conv.id}`);
  return { success: "Goles y asistencias guardados." };
}
