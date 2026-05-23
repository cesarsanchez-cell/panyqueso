import Link from "next/link";

import { requireRole } from "@/lib/auth/require-role";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { RequestCard } from "./request-card";

type Status = Database["public"]["Enums"]["change_request_status"];
type ActionType = Database["public"]["Enums"]["change_request_action"];

type Tab = "pending" | "flagged" | "all";

type SearchParams = {
  tab?: string;
  actions?: string;
  page?: string;
};

const STATUS_LABEL: Record<Status, string> = {
  pending: "Pendiente",
  flagged: "Marcada",
  approved: "Aprobada",
  rejected: "Rechazada",
};

const TAB_LABEL: Record<Tab, string> = {
  pending: "Pendientes",
  flagged: "Marcadas",
  all: "Todas",
};

const TABS: Tab[] = ["pending", "flagged", "all"];

const ALL_ACTIONS: readonly ActionType[] = [
  "create_player",
  "update_sensitive_fields",
  "deactivate_player",
  "reactivate_player",
];

const ACTION_LABEL: Record<ActionType, string> = {
  create_player: "Nuevo jugador",
  update_sensitive_fields: "Cambio sensible",
  deactivate_player: "Desactivar",
  reactivate_player: "Reactivar",
};

const PAGE_SIZE = 20;

function parseTab(raw: string | undefined): Tab {
  if (raw === "flagged" || raw === "all") return raw;
  return "pending";
}

function parseActions(raw: string | undefined): ActionType[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ActionType => (ALL_ACTIONS as readonly string[]).includes(s));
}

function parsePage(raw: string | undefined): number {
  if (!raw) return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  return n;
}

function buildHref(params: { tab?: Tab; actions?: ActionType[]; page?: number }): string {
  const qs = new URLSearchParams();
  if (params.tab && params.tab !== "pending") qs.set("tab", params.tab);
  if (params.actions && params.actions.length > 0) qs.set("actions", params.actions.join(","));
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  const s = qs.toString();
  return s ? `/auditoria?${s}` : "/auditoria";
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requireRole("veedor");

  const sp = await searchParams;
  const tab = parseTab(sp.tab);
  const selectedActions = parseActions(sp.actions);
  const page = parsePage(sp.page);

  const supabase = await createClient();

  // Base query. Filtros segun tab + selectedActions. Paginacion solo en tab=all.
  let query = supabase
    .from("player_change_requests")
    .select(
      `id, action_type, player_id, requested_by, proposed_values, old_values,
       reason, status, created_at,
       requester:profiles!requested_by(nombre),
       player:players!player_id(id, nombre, status)`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (tab === "pending") {
    query = query.eq("status", "pending");
  } else if (tab === "flagged") {
    query = query.eq("status", "flagged");
  }
  // tab=all: sin filtro de status, paginado.

  if (selectedActions.length > 0) {
    query = query.in("action_type", selectedActions);
  }

  if (tab === "all") {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    query = query.range(from, to);
  }

  const { data: requests, error, count } = await query;

  if (error) {
    throw new Error(`No se pudieron cargar las solicitudes: ${error.message}`);
  }

  const totalCount = count ?? 0;
  const totalPages = tab === "all" ? Math.max(1, Math.ceil(totalCount / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Auditoría</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {totalCount} {totalCount === 1 ? "solicitud" : "solicitudes"} ·{" "}
          {TAB_LABEL[tab].toLowerCase()}
          {selectedActions.length > 0
            ? ` · filtro: ${selectedActions.map((a) => ACTION_LABEL[a]).join(", ")}`
            : ""}
        </p>
      </div>

      <div className="space-y-3">
        <nav aria-label="Filtros por estado" className="flex gap-1 border-b border-neutral-200">
          {TABS.map((t) => {
            const active = t === tab;
            return (
              <Link
                key={t}
                href={buildHref({ tab: t, actions: selectedActions })}
                className={
                  active
                    ? "border-b-2 border-neutral-900 px-3 py-2 text-sm font-semibold text-neutral-900"
                    : "border-b-2 border-transparent px-3 py-2 text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
                }
              >
                {TAB_LABEL[t]}
              </Link>
            );
          })}
        </nav>

        <div aria-label="Filtros por tipo" className="flex flex-wrap gap-2">
          {ALL_ACTIONS.map((a) => {
            const active = selectedActions.includes(a);
            const next = active ? selectedActions.filter((x) => x !== a) : [...selectedActions, a];
            return (
              <Link
                key={a}
                href={buildHref({ tab, actions: next })}
                className={
                  active
                    ? "rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white transition hover:bg-neutral-800"
                    : "rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
                }
              >
                {ACTION_LABEL[a]}
              </Link>
            );
          })}
          {selectedActions.length > 0 ? (
            <Link
              href={buildHref({ tab, actions: [] })}
              className="rounded-full px-3 py-1 text-xs font-medium text-neutral-500 underline transition hover:text-neutral-700"
            >
              Limpiar tipos
            </Link>
          ) : null}
        </div>
      </div>

      {!requests || requests.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          No hay solicitudes que coincidan con el filtro.
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((r) => (
            <RequestCard
              key={r.id}
              canDecide={r.status === "pending" || r.status === "flagged"}
              isOwn={r.requested_by === ctx.userId}
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

      {tab === "all" && totalPages > 1 ? (
        <nav
          aria-label="Paginación"
          className="flex items-center justify-between border-t border-neutral-200 pt-4 text-sm"
        >
          <div className="text-neutral-500">
            Página {page} de {totalPages}
          </div>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={buildHref({ tab, actions: selectedActions, page: page - 1 })}
                className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-medium text-neutral-700 transition hover:bg-neutral-50"
              >
                ← Anterior
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={buildHref({ tab, actions: selectedActions, page: page + 1 })}
                className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-medium text-neutral-700 transition hover:bg-neutral-50"
              >
                Siguiente →
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
