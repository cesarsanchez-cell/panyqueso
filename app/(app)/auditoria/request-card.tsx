"use client";

import { useActionState } from "react";

import type { Database, Json } from "@/lib/supabase/database.types";

import { decideRequest, type DecisionState } from "./actions";

type ActionType = Database["public"]["Enums"]["change_request_action"];
type Status = Database["public"]["Enums"]["change_request_status"];

const ACTION_LABEL: Record<ActionType, string> = {
  create_player: "Nuevo jugador",
  update_sensitive_fields: "Cambio sensible",
  deactivate_player: "Desactivar",
  reactivate_player: "Reactivar",
};

const STATUS_BADGE: Record<Status, string> = {
  pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  flagged: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  approved: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  rejected: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

type RequestView = {
  id: string;
  action_type: ActionType;
  proposed_values: Json;
  old_values: Json;
  reason: string;
  status: Status;
  statusLabel: string;
  created_at: string;
  requesterName: string;
  playerName: string | null;
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isJsonObject(v: Json): v is { [k: string]: Json | undefined } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function formatValue(v: Json | undefined): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.map((x) => formatValue(x)).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function renderProposed(action: ActionType, proposed: Json, old: Json): React.ReactNode {
  if (!isJsonObject(proposed)) {
    return <p className="text-sm text-neutral-500">Sin detalle.</p>;
  }

  const entries = Object.entries(proposed);
  if (entries.length === 0) {
    return <p className="text-sm text-neutral-500">Sin cambios propuestos.</p>;
  }

  // Para update_sensitive_fields mostramos old -> new si tenemos old_values.
  const showDiff = action === "update_sensitive_fields" && isJsonObject(old);

  return (
    <ul className="space-y-1 text-sm">
      {entries.map(([key, value]) => (
        <li key={key} className="flex flex-wrap gap-2">
          <span className="font-medium text-neutral-700">{key}:</span>
          {showDiff && isJsonObject(old) && key in old ? (
            <span className="text-neutral-600">
              <span className="line-through text-neutral-400">{formatValue(old[key])}</span>
              {" → "}
              <span className="font-medium text-neutral-900">{formatValue(value)}</span>
            </span>
          ) : (
            <span className="text-neutral-900">{formatValue(value)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function RequestCard({ request }: { request: RequestView }) {
  const [state, formAction, pending] = useActionState<DecisionState, FormData>(decideRequest, null);

  const targetLabel =
    request.action_type === "create_player"
      ? isJsonObject(request.proposed_values) && typeof request.proposed_values.nombre === "string"
        ? request.proposed_values.nombre
        : "—"
      : (request.playerName ?? "—");

  return (
    <article className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            {ACTION_LABEL[request.action_type]}
          </p>
          <h2 className="truncate text-lg font-semibold text-neutral-900">{targetLabel}</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Por {request.requesterName} · {formatDateTime(request.created_at)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[request.status]}`}
        >
          {request.statusLabel}
        </span>
      </header>

      <div className="mt-4 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Motivo</p>
          <p className="mt-1 text-sm text-neutral-700">{request.reason}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Detalle</p>
          <div className="mt-1">
            {renderProposed(request.action_type, request.proposed_values, request.old_values)}
          </div>
        </div>
      </div>

      <form action={formAction} className="mt-5 space-y-3">
        <input type="hidden" name="request_id" value={request.id} />
        <div>
          <label
            htmlFor={`comment-${request.id}`}
            className="block text-xs font-medium text-neutral-700"
          >
            Comentario (obligatorio para rechazar / flag)
          </label>
          <textarea
            id={`comment-${request.id}`}
            name="comment"
            rows={2}
            className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="decision"
            value="approve"
            disabled={pending}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Aprobar
          </button>
          <button
            type="submit"
            name="decision"
            value="reject"
            disabled={pending}
            className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Rechazar
          </button>
          <button
            type="submit"
            name="decision"
            value="flag"
            disabled={pending}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Marcar
          </button>
        </div>

        {state && "error" in state ? (
          <p
            role="alert"
            aria-live="polite"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {state.error}
          </p>
        ) : null}
        {state && "success" in state ? (
          <p
            role="status"
            aria-live="polite"
            className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          >
            {state.success}
          </p>
        ) : null}
      </form>
    </article>
  );
}
