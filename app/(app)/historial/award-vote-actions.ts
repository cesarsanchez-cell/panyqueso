"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-role";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type AwardCategory = Database["public"]["Enums"]["award_category"];

export type AwardVoteState = null | { error: string } | { success: string };

/**
 * El jugador logueado vota un premio (carnicero / pinocho) de un partido que
 * jugó. Toda la validación (jugó, ventana abierta, premio habilitado, el votado
 * jugó) vive en la RPC cast_award_vote (SECURITY DEFINER). Acá solo mapeamos los
 * errores conocidos a un mensaje claro.
 */
export async function castAwardVote(
  _prev: AwardVoteState,
  formData: FormData,
): Promise<AwardVoteState> {
  await requireUser();

  const matchId = String(formData.get("match_id") ?? "").trim();
  const categoria = String(formData.get("categoria") ?? "").trim();
  const votedPlayerId = String(formData.get("voted_player_id") ?? "").trim();
  if (!matchId || !votedPlayerId) return { error: "Elegí a quién votar." };
  if (categoria !== "carnicero" && categoria !== "pinocho") {
    return { error: "Categoría inválida." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cast_award_vote", {
    p_match_id: matchId,
    p_categoria: categoria as AwardCategory,
    p_voted_player_id: votedPlayerId,
  });

  if (error) {
    const m = error.message;
    if (m.includes("voting_closed")) return { error: "La votación de este premio ya cerró." };
    if (m.includes("award_disabled"))
      return { error: "Este premio no está habilitado en el grupo." };
    if (m.includes("voter_not_in_match"))
      return { error: "Solo pueden votar los que jugaron ese partido." };
    if (m.includes("voted_not_in_match")) return { error: "Ese jugador no jugó este partido." };
    return { error: "No se pudo registrar tu voto. Probá de nuevo." };
  }

  revalidatePath("/historial");
  return { success: "¡Voto registrado!" };
}
