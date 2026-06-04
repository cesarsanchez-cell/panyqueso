import type { createClient } from "@/lib/supabase/server";

import type { PreviousComposition } from "./generate";

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

/**
 * FUT-87/88: composición (equipos por id) del último partido pasado del grupo
 * al que pertenece esta convocatoria. La usa el generador para evitar repetir
 * los equipos, y la página para mostrarle al admin la señal de variedad.
 * Devuelve null si el grupo no tuvo partidos previos (primera fecha).
 */
export async function loadPreviousComposition(
  supabase: SupabaseLike,
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
