import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/require-role";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { RequestCard } from "../request-card";

type Status = Database["public"]["Enums"]["change_request_status"];

const STATUS_LABEL: Record<Status, string> = {
  pending: "Pendiente",
  flagged: "Marcada",
  approved: "Aprobada",
  rejected: "Rechazada",
};

const AUDIT_ACTION_LABEL: Record<string, string> = {
  approve_change_request: "Solicitud aprobada",
  reject_change_request: "Solicitud rechazada",
  flag_change_request: "Solicitud marcada",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isJsonObject(v: Json): v is { [k: string]: Json | undefined } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export default async function AuditoriaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireRole("veedor");
  const { id } = await params;

  const supabase = await createClient();

  const { data: request, error } = await supabase
    .from("player_change_requests")
    .select(
      `id, action_type, player_id, requested_by, reviewed_by, reviewed_at,
       proposed_values, old_values, reason, status, review_comment, created_at,
       requester:profiles!requested_by(nombre),
       reviewer:profiles!reviewed_by(nombre),
       player:players!player_id(id, nombre, status)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo cargar la solicitud: ${error.message}`);
  }
  if (!request) {
    notFound();
  }

  // Timeline del audit_log para esta request. Aprobar/rechazar/marcar
  // dejan una linea cada vez. Filtramos por entity y entity_id.
  const { data: timeline, error: timelineError } = await supabase
    .from("audit_log")
    .select(
      `id, action, payload, created_at,
       actor:profiles!actor_id(nombre)`,
    )
    .eq("entity", "player_change_request")
    .eq("entity_id", id)
    .order("created_at", { ascending: true });

  if (timelineError) {
    throw new Error(`No se pudo cargar el timeline: ${timelineError.message}`);
  }

  const canDecide = request.status === "pending" || request.status === "flagged";
  const isOwn = request.requested_by === ctx.userId;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/auditoria"
          className="text-sm text-neutral-500 transition hover:text-neutral-700"
        >
          ← Volver a auditoría
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Detalle de solicitud</h1>
        <p className="mt-1 text-sm text-neutral-500">ID {request.id}</p>
      </div>

      <RequestCard
        canDecide={canDecide}
        isOwn={isOwn}
        request={{
          id: request.id,
          action_type: request.action_type,
          proposed_values: request.proposed_values,
          old_values: request.old_values,
          reason: request.reason,
          status: request.status,
          created_at: request.created_at,
          statusLabel: STATUS_LABEL[request.status],
          requesterName: request.requester?.nombre ?? "—",
          playerName: request.player?.nombre ?? null,
        }}
      />

      {request.reviewed_at ? (
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Revisión
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Decisión" value={STATUS_LABEL[request.status]} />
            <Row label="Revisada por" value={request.reviewer?.nombre ?? "—"} />
            <Row label="Fecha" value={formatDateTime(request.reviewed_at)} />
            {request.review_comment ? (
              <div>
                <dt className="text-neutral-500">Comentario</dt>
                <dd className="mt-1 whitespace-pre-line text-neutral-900">
                  {request.review_comment}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Timeline</h2>
        {!timeline || timeline.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            Aún no hay eventos registrados para esta solicitud.
          </p>
        ) : (
          <ol className="mt-3 space-y-3">
            {timeline.map((entry) => {
              const comment =
                isJsonObject(entry.payload) && typeof entry.payload.comment === "string"
                  ? entry.payload.comment
                  : null;
              return (
                <li key={entry.id} className="border-l-2 border-neutral-200 pl-3 text-sm">
                  <p className="font-medium text-neutral-900">
                    {AUDIT_ACTION_LABEL[entry.action] ?? entry.action}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {entry.actor?.nombre ?? "—"} · {formatDateTime(entry.created_at)}
                  </p>
                  {comment ? (
                    <p className="mt-1 whitespace-pre-line text-neutral-700">{comment}</p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {request.player ? (
        <div>
          <Link
            href={`/jugadores/${request.player.id}`}
            className="text-sm text-neutral-500 underline transition hover:text-neutral-700"
          >
            Ver detalle del jugador →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-neutral-900">{value}</dd>
    </div>
  );
}
