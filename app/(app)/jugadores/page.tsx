import Link from "next/link";

import { requireRole } from "@/lib/auth/require-role";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type PlayerStatus = Database["public"]["Enums"]["player_status"];
type PlayerRoleField = Database["public"]["Enums"]["player_role_field"];

const STATUS_LABEL: Record<PlayerStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  inactive: "Inactivo",
};

const ROLE_FIELD_LABEL: Record<PlayerRoleField, string> = {
  arquero: "Arquero",
  jugador_campo: "Campo",
  mixto: "Mixto",
};

const STATUS_BADGE: Record<PlayerStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  approved: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  inactive: "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200",
};

const FILTERS: { label: string; value: PlayerStatus | "all" }[] = [
  { label: "Todos", value: "all" },
  { label: "Aprobados", value: "approved" },
  { label: "Pendientes", value: "pending" },
  { label: "Inactivos", value: "inactive" },
];

function parseStatus(raw: string | undefined): PlayerStatus | null {
  if (raw === "pending" || raw === "approved" || raw === "inactive") return raw;
  return null;
}

export default async function JugadoresPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; created?: string }>;
}) {
  const ctx = await requireRole(["admin", "veedor"]);

  const params = await searchParams;
  const statusFilter = parseStatus(params.status);
  const isAdmin = ctx.profile.role === "admin";
  const showCreatedFlash = params.created === "1";

  const supabase = await createClient();
  let query = supabase
    .from("players")
    .select("id, nombre, edad, status, role_field")
    .order("nombre", { ascending: true });

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data: players, error } = await query;

  if (error) {
    throw new Error(`No se pudieron cargar los jugadores: ${error.message}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Jugadores</h1>
        {isAdmin ? (
          <Link
            href="/jugadores/nuevo"
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800"
          >
            Nuevo jugador
          </Link>
        ) : null}
      </div>

      {showCreatedFlash ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Solicitud creada. Queda pendiente de aprobación por un veedor.
        </div>
      ) : null}

      <nav className="-mb-px flex gap-2 overflow-x-auto border-b border-neutral-200">
        {FILTERS.map((opt) => {
          const active = opt.value === "all" ? !statusFilter : statusFilter === opt.value;
          const href = opt.value === "all" ? "/jugadores" : `/jugadores?status=${opt.value}`;
          return (
            <Link
              key={opt.value}
              href={href}
              className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition ${
                active
                  ? "border-neutral-900 text-neutral-900"
                  : "border-transparent text-neutral-500 hover:text-neutral-700"
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
      </nav>

      {players.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          {statusFilter
            ? `Sin jugadores en estado "${STATUS_LABEL[statusFilter]}".`
            : "Aún no hay jugadores cargados."}
        </div>
      ) : (
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 bg-white">
          {players.map((p) => (
            <li key={p.id}>
              <Link
                href={`/jugadores/${p.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-neutral-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-neutral-900">{p.nombre}</p>
                  <p className="text-xs text-neutral-500">
                    {p.edad} años · {ROLE_FIELD_LABEL[p.role_field]}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[p.status]}`}
                >
                  {STATUS_LABEL[p.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
