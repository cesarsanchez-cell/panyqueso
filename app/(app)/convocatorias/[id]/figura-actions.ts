"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type SaveFiguraState = null | { error: string } | { success: string };

/**
 * Asigna (o limpia) la figura del partido asociado a una convocatoria.
 * - Admin-only.
 * - Convocatoria en 'cerrada' o 'jugada' (cuando ya existe el match).
 * - figura_player_id vacio -> limpia (null). Si viene, tiene que ser un
 *   jugador que jugo el partido: lo validamos contra el roster acá y, ademas,
 *   el trigger matches_figura_en_roster lo garantiza a nivel DB (P0042).
 * - UPDATE directo: la RLS de matches ya es admin-only (mismo patron que goles
 *   y video).
 */
export async function saveMatchFigura(
  _prev: SaveFiguraState,
  formData: FormData,
): Promise<SaveFiguraState> {
  await requireRole(["admin", "coordinador"]);

  const convocatoriaId = String(formData.get("convocatoria_id") ?? "").trim();
  if (!convocatoriaId) return { error: "Falta el id de la convocatoria." };

  const rawFigura = String(formData.get("figura_player_id") ?? "").trim();
  const figuraPlayerId = rawFigura.length === 0 ? null : rawFigura;

  const supabase = await createClient();

  const { data: conv, error: convErr } = await supabase
    .from("convocatorias")
    .select("id, status")
    .eq("id", convocatoriaId)
    .maybeSingle();

  if (convErr || !conv) return { error: "Convocatoria no encontrada." };
  if (conv.status !== "cerrada" && conv.status !== "jugada") {
    return {
      error: "Solo se puede elegir la figura si la convocatoria está cerrada o jugada.",
    };
  }

  const { data: match, error: matchErr } = await supabase
    .from("matches")
    .select("id")
    .eq("convocatoria_id", conv.id)
    .maybeSingle();

  if (matchErr || !match) return { error: "No se encontró el partido asociado." };

  // Validamos en app que la figura este en el roster del match (ademas del
  // trigger DB), para devolver un mensaje claro en vez de un error crudo.
  if (figuraPlayerId !== null) {
    const { data: teams, error: teamsErr } = await supabase
      .from("match_teams")
      .select("id")
      .eq("match_id", match.id);

    if (teamsErr) {
      return { error: `No se pudieron cargar los teams: ${teamsErr.message}` };
    }
    const teamIds = (teams ?? []).map((t) => t.id);

    const { data: roster, error: rosterErr } = await supabase
      .from("match_team_players")
      .select("player_id")
      .in("match_team_id", teamIds);

    if (rosterErr) {
      return { error: `No se pudo validar la figura: ${rosterErr.message}` };
    }
    const playedIds = new Set((roster ?? []).map((r) => r.player_id));
    if (!playedIds.has(figuraPlayerId)) {
      return { error: "La figura tiene que ser un jugador que jugó el partido." };
    }
  }

  const { error: updateErr } = await supabase
    .from("matches")
    .update({ figura_player_id: figuraPlayerId })
    .eq("id", match.id);

  if (updateErr) {
    return { error: `No se pudo guardar la figura: ${updateErr.message}` };
  }

  revalidatePath(`/convocatorias/${conv.id}`);
  return { success: figuraPlayerId === null ? "Figura quitada." : "Figura del partido guardada." };
}
