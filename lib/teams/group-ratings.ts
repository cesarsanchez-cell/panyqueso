import type { Database } from "@/lib/supabase/database.types";
import type { createClient } from "@/lib/supabase/server";

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

type RoleField = Database["public"]["Enums"]["player_role_field"];
type PositionPref = Database["public"]["Enums"]["position_pref"];
type LiderazgoNivel = Database["public"]["Enums"]["liderazgo_nivel"];

/**
 * Rating efectivo de un jugador EN un grupo (FUT-103/104). La `edad` NO va acá:
 * es global y se sigue leyendo de `players`.
 */
export type GroupRating = {
  internal_score: number;
  physical: number;
  mental: number;
  technical: number;
  role_field: RoleField;
  position_pref: PositionPref;
  positions_possible: PositionPref[];
  // FUT-127: liderazgo del jugador en el grupo (potenciador de equipo).
  liderazgo: LiderazgoNivel;
};

/**
 * Devuelve, para un grupo, el rating por grupo de cada jugador pedido. Los
 * callers usan estos valores en vez de la base de `players` (que queda como
 * semilla). Si `grupoId` es null/undefined (convocatoria suelta) o no hay
 * jugadores, devuelve un mapa vacío → los callers caen a la base.
 */
export async function loadGroupRatings(
  supabase: SupabaseLike,
  grupoId: string | null | undefined,
  playerIds: string[],
): Promise<Map<string, GroupRating>> {
  const map = new Map<string, GroupRating>();
  if (!grupoId || playerIds.length === 0) return map;

  const { data } = await supabase
    .from("player_group_ratings")
    .select(
      "player_id, internal_score, physical, mental, technical, role_field, position_pref, positions_possible, liderazgo",
    )
    .eq("grupo_id", grupoId)
    .in("player_id", playerIds);

  for (const r of data ?? []) {
    map.set(r.player_id, {
      internal_score: Number(r.internal_score),
      physical: r.physical,
      mental: r.mental,
      technical: r.technical,
      role_field: r.role_field,
      position_pref: r.position_pref,
      positions_possible: r.positions_possible ?? [],
      liderazgo: r.liderazgo,
    });
  }
  return map;
}
