"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type VoteState = null | { error: string } | { success: string };

/**
 * El jugador logueado vota la figura de un partido que jugó. Toda la validación
 * (jugó el partido, la votación está abierta, el votado jugó) vive en la RPC
 * cast_figura_vote (SECURITY DEFINER). Acá solo mapeamos los errores conocidos
 * a un mensaje claro.
 */
export async function castFiguraVote(_prev: VoteState, formData: FormData): Promise<VoteState> {
  await requireUser();

  const matchId = String(formData.get("match_id") ?? "").trim();
  const votedPlayerId = String(formData.get("voted_player_id") ?? "").trim();
  if (!matchId || !votedPlayerId) return { error: "Elegí a quién votar." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cast_figura_vote", {
    p_match_id: matchId,
    p_voted_player_id: votedPlayerId,
  });

  if (error) {
    const m = error.message;
    if (m.includes("voting_closed")) return { error: "La votación de la figura ya cerró." };
    if (m.includes("voter_not_in_match"))
      return { error: "Solo pueden votar los que jugaron ese partido." };
    if (m.includes("voted_not_in_match")) return { error: "Ese jugador no jugó este partido." };
    return { error: "No se pudo registrar tu voto. Probá de nuevo." };
  }

  revalidatePath("/historial");
  return { success: "¡Voto registrado!" };
}
