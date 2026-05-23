import { requireRole } from "@/lib/auth/require-role";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { RequestCard } from "./request-card";

type Status = Database["public"]["Enums"]["change_request_status"];

const STATUS_LABEL: Record<Status, string> = {
  pending: "Pendiente",
  flagged: "Marcada",
  approved: "Aprobada",
  rejected: "Rechazada",
};

export default async function AuditoriaPage() {
  await requireRole("veedor");

  const supabase = await createClient();
  const { data: requests, error } = await supabase
    .from("player_change_requests")
    .select(
      `id, action_type, player_id, requested_by, proposed_values, old_values,
       reason, status, created_at,
       requester:profiles!requested_by(nombre),
       player:players!player_id(id, nombre, status)`,
    )
    .in("status", ["pending", "flagged"])
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`No se pudieron cargar las solicitudes: ${error.message}`);
  }

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const flaggedCount = requests.filter((r) => r.status === "flagged").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Auditoría</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {pendingCount} pendiente{pendingCount === 1 ? "" : "s"}
          {flaggedCount > 0 ? ` · ${flaggedCount} marcada${flaggedCount === 1 ? "" : "s"}` : ""}
        </p>
      </div>

      {requests.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          No hay solicitudes pendientes ni marcadas.
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((r) => (
            <RequestCard
              key={r.id}
              request={{
                id: r.id,
                action_type: r.action_type,
                proposed_values: r.proposed_values,
                old_values: r.old_values,
                reason: r.reason,
                status: r.status,
                created_at: r.created_at,
                statusLabel: STATUS_LABEL[r.status],
                requesterName: r.requester?.nombre ?? "—",
                playerName: r.player?.nombre ?? null,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
