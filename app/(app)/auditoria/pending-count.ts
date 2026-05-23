import { createClient } from "@/lib/supabase/server";

/**
 * Fase 4 PR 1: cantidad de solicitudes pending+flagged.
 * RLS deja a admin ver solo las suyas y a veedor ver todas — el caller
 * decide cuándo invocarla (típicamente solo para veedor).
 */
export async function getPendingAuditCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("player_change_requests")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "flagged"]);

  if (error) {
    // No reventamos el layout por un fallo de count: simplemente no se
    // muestra badge. El error queda en logs del servidor.
    console.error("getPendingAuditCount:", error.message);
    return 0;
  }

  return count ?? 0;
}
