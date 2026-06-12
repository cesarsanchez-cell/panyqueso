"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type SaveAwardState = null | { error: string } | { success: string };

const LABEL = {
  carnicero: "Carnicero",
  pinocho: "Pinocho",
} as const;

/**
 * Asigna (o limpia) el override/desempate del admin para un premio votado
 * (carnicero / pinocho) del partido de una convocatoria. Espejo de
 * saveMatchFigura (FUT-99): mismo flujo, columnas distintas.
 * - Admin-only.
 * - Convocatoria en 'cerrada' o 'jugada'.
 * - vacío -> limpia (null = respeta el voto). Si viene, tiene que ser un
 *   jugador que jugó el partido (validado contra el roster).
 * - UPDATE directo: la RLS de matches ya es admin-only.
 */
export async function saveMatchAward(
  _prev: SaveAwardState,
  formData: FormData,
): Promise<SaveAwardState> {
  await requireRole(["admin", "coordinador"]);

  const convocatoriaId = String(formData.get("convocatoria_id") ?? "").trim();
  if (!convocatoriaId) return { error: "Falta el id de la convocatoria." };

  const categoria = String(formData.get("categoria") ?? "").trim();
  if (categoria !== "carnicero" && categoria !== "pinocho") {
    return { error: "Categoría inválida." };
  }

  const raw = String(formData.get("award_player_id") ?? "").trim();
  const playerId = raw.length === 0 ? null : raw;

  const supabase = await createClient();

  const { data: conv, error: convErr } = await supabase
    .from("convocatorias")
    .select("id, status")
    .eq("id", convocatoriaId)
    .maybeSingle();

  if (convErr || !conv) return { error: "Convocatoria no encontrada." };
  if (conv.status !== "cerrada" && conv.status !== "jugada") {
    return {
      error: "Solo se puede elegir el premio si la convocatoria está cerrada o jugada.",
    };
  }

  const { data: match, error: matchErr } = await supabase
    .from("matches")
    .select("id")
    .eq("convocatoria_id", conv.id)
    .maybeSingle();

  if (matchErr || !match) return { error: "No se encontró el partido asociado." };

  // El override tiene que ser un jugador que jugó el partido (validación en app;
  // el premio es admin-only y se chequea contra el roster real del match).
  if (playerId !== null) {
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
      return { error: `No se pudo validar: ${rosterErr.message}` };
    }
    const playedIds = new Set((roster ?? []).map((r) => r.player_id));
    if (!playedIds.has(playerId)) {
      return { error: `El ${LABEL[categoria]} tiene que ser un jugador que jugó el partido.` };
    }
  }

  const patch =
    categoria === "carnicero" ? { carnicero_player_id: playerId } : { pinocho_player_id: playerId };

  const { error: updateErr } = await supabase.from("matches").update(patch).eq("id", match.id);

  if (updateErr) {
    return { error: `No se pudo guardar el ${LABEL[categoria]}: ${updateErr.message}` };
  }

  revalidatePath(`/convocatorias/${conv.id}`);
  return {
    success: playerId === null ? `${LABEL[categoria]} quitado.` : `${LABEL[categoria]} guardado.`,
  };
}
