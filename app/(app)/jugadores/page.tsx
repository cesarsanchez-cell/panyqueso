import Link from "next/link";

import { requireRole } from "@/lib/auth/require-role";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { AltaCoordinadorCard, type CoordinadorGrupo } from "./alta-coordinador-card";
import { PlayersListFilterable } from "./players-list-filterable";

type PlayerStatus = Database["public"]["Enums"]["player_status"];
type PlayerRoleField = Database["public"]["Enums"]["player_role_field"];
type ChangeRequestStatus = Database["public"]["Enums"]["change_request_status"];

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

const REQUEST_STATUS_LABEL: Partial<Record<ChangeRequestStatus, string>> = {
  pending: "En aprobación",
  flagged: "Marcada",
};

const REQUEST_STATUS_BADGE: Partial<Record<ChangeRequestStatus, string>> = {
  pending: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  flagged: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
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

function isJsonObject(v: Json): v is { [k: string]: Json | undefined } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readString(obj: Json, key: string): string | null {
  if (!isJsonObject(obj)) return null;
  const v = obj[key];
  return typeof v === "string" ? v : null;
}

function readNumber(obj: Json, key: string): number | null {
  if (!isJsonObject(obj)) return null;
  const v = obj[key];
  return typeof v === "number" ? v : null;
}

function readRoleField(obj: Json): PlayerRoleField | null {
  const v = readString(obj, "role_field");
  if (v === "arquero" || v === "jugador_campo" || v === "mixto") return v;
  return null;
}

export default async function JugadoresPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; created?: string; requested?: string }>;
}) {
  const ctx = await requireRole(["admin", "veedor", "coordinador"]);

  const params = await searchParams;
  const statusFilter = parseStatus(params.status);
  const isAdmin = ctx.profile.role === "admin";
  const isCoordinador = ctx.profile.role === "coordinador";
  const showCreatedFlash = params.created === "1";
  const showRequestedFlash = params.requested === "1";

  const supabase = await createClient();
  let playersQuery = supabase
    .from("players")
    .select("id, nombre, apodo, edad, status, role_field, avatar_url, club_id")
    .order("nombre", { ascending: true });

  if (statusFilter) {
    playersQuery = playersQuery.eq("status", statusFilter);
  }

  const { data: players, error } = await playersQuery;

  if (error) {
    throw new Error(`No se pudieron cargar los jugadores: ${error.message}`);
  }

  // En la tab Pendientes incluimos las solicitudes create_player en
  // pending/flagged: son "jugadores propuestos" que todavia no existen como
  // row en players. RLS segrega: admin ve solo las propias, veedor ve todas.
  const includeCreateRequests = statusFilter === "pending";
  let createRequests: {
    id: string;
    proposed_values: Json;
    status: ChangeRequestStatus;
  }[] = [];
  if (includeCreateRequests) {
    const { data, error: reqError } = await supabase
      .from("player_change_requests")
      .select("id, proposed_values, status")
      .eq("action_type", "create_player")
      .in("status", ["pending", "flagged"])
      .order("created_at", { ascending: false });
    if (reqError) {
      throw new Error(`No se pudieron cargar las solicitudes: ${reqError.message}`);
    }
    createRequests = data ?? [];
  }

  // Para el alta group-first del coordinador: sus grupos activos (la RLS ya los
  // filtra a los que gestiona).
  let coordinadorGrupos: CoordinadorGrupo[] = [];
  if (isCoordinador) {
    const { data: grupos } = await supabase
      .from("grupos")
      .select("id, nombre")
      .eq("status", "activo")
      .order("nombre", { ascending: true });
    coordinadorGrupos = grupos ?? [];
  }

  const isEmpty = players.length === 0 && createRequests.length === 0;

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
          Jugador dado de alta.
        </div>
      ) : null}

      {showRequestedFlash ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Solicitud creada. Queda pendiente de aprobación por un veedor.
        </div>
      ) : null}

      {isCoordinador ? <AltaCoordinadorCard grupos={coordinadorGrupos} /> : null}

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

      {isEmpty ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          {statusFilter
            ? `Sin jugadores en estado "${STATUS_LABEL[statusFilter]}".`
            : "Aún no hay jugadores cargados."}
        </div>
      ) : (
        <>
          {createRequests.length > 0 ? (
            <ul className="divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 bg-white">
              {createRequests.map((r) => {
                const nombre = readString(r.proposed_values, "nombre") ?? "(sin nombre)";
                const edad = readNumber(r.proposed_values, "edad");
                const roleField = readRoleField(r.proposed_values);
                return (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-4 bg-sky-50/30 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-neutral-900">
                        {nombre}
                        <span className="ml-2 text-xs font-normal text-neutral-500">
                          · solicitud
                        </span>
                      </p>
                      <p className="text-xs text-neutral-500">
                        {edad !== null ? `${edad} años` : "edad —"}
                        {roleField ? ` · ${ROLE_FIELD_LABEL[roleField]}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${REQUEST_STATUS_BADGE[r.status] ?? ""}`}
                    >
                      {REQUEST_STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <PlayersListFilterable players={players} />
        </>
      )}
    </div>
  );
}
