import Link from "next/link";

import { requireRole } from "@/lib/auth/require-role";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { AgregarJugadorCard, type AgregarJugadorGrupo } from "./agregar-jugador-card";
import { GrupoFilter } from "./grupo-filter";
import { PlayersListFilterable } from "./players-list-filterable";

type PlayerStatus = Database["public"]["Enums"]["player_status"];
type PlayerRoleField = Database["public"]["Enums"]["player_role_field"];
type ChangeRequestStatus = Database["public"]["Enums"]["change_request_status"];
type RatingConfidence = Database["public"]["Enums"]["rating_confidence"];

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
  searchParams: Promise<{
    status?: string;
    grupo?: string;
    sin_calificar?: string;
    created?: string;
    requested?: string;
  }>;
}) {
  const ctx = await requireRole(["admin", "veedor", "coordinador"]);

  const params = await searchParams;
  const statusFilter = parseStatus(params.status);
  const sinCalificarFilter = params.sin_calificar === "1";
  const isAdmin = ctx.profile.role === "admin";
  const isCoordinador = ctx.profile.role === "coordinador";
  // Admin y coordinador gestionan rosters (el veedor solo audita). La card de
  // "Agregar jugador" es para ambos; el veedor no la ve.
  const canManage = isAdmin || isCoordinador;
  const showCreatedFlash = params.created === "1";
  const showRequestedFlash = params.requested === "1";

  const supabase = await createClient();

  // Grupos para el filtro (y para la card de alta). La RLS de grupos los acota:
  // admin ve todos; coordinador/veedor solo los suyos.
  const { data: gruposData } = await supabase
    .from("grupos")
    .select("id, nombre")
    .eq("status", "activo")
    .order("nombre", { ascending: true });
  const gruposFiltro = gruposData ?? [];
  const grupoFilter =
    params.grupo && gruposFiltro.some((g) => g.id === params.grupo) ? params.grupo : null;

  // Si se filtra por grupo, acotamos a sus miembros activos.
  let memberIds: string[] | null = null;
  if (grupoFilter) {
    const { data: members } = await supabase
      .from("grupo_membresias")
      .select("player_id")
      .eq("grupo_id", grupoFilter)
      .eq("status", "activo");
    memberIds = (members ?? []).map((m) => m.player_id).filter((id): id is string => Boolean(id));
  }

  type PlayerRow = {
    id: string;
    nombre: string;
    apodo: string | null;
    edad: number;
    status: PlayerStatus;
    role_field: PlayerRoleField;
    avatar_url: string | null;
    club_id: string | null;
    rating_confidence: RatingConfidence;
  };

  let players: PlayerRow[] = [];
  // memberIds vacío = el grupo no tiene miembros: no hay nada que listar.
  if (!(memberIds !== null && memberIds.length === 0)) {
    let playersQuery = supabase
      .from("players")
      .select("id, nombre, apodo, edad, status, role_field, avatar_url, club_id, rating_confidence")
      .eq("is_guest", false) // los invitados puntuales no son jugadores del sistema
      .order("nombre", { ascending: true });

    if (statusFilter) playersQuery = playersQuery.eq("status", statusFilter);
    if (memberIds !== null) playersQuery = playersQuery.in("id", memberIds);

    const { data, error } = await playersQuery;
    if (error) throw new Error(`No se pudieron cargar los jugadores: ${error.message}`);
    players = data ?? [];
  }

  // "Sin calificar" es a NIVEL JUGADOR (no por grupo): ¿alguien lo evaluó alguna
  // vez, en cualquier lado? El rating es por grupo, pero al entrar a un grupo
  // nuevo se HEREDA el de un grupo previo; entonces "calificado en un grupo" ⇒
  // "calificado" a secas. Si lo calculáramos por grupo, el general y el grupo se
  // contradicen (calificado en general, sin calificar en el grupo heredado). El
  // filtro de grupo solo decide A QUIÉN listar, no si está calificado.
  //
  // Calificado = confianza base ≠ 'baja'  (vía base, que setea confianza)
  //           OR existe un cambio de rating no-rechazado en cualquier grupo/base
  //              (vía editor por grupo, que cambia los subs pero deja confianza
  //              en 'baja'). El OR es retroactivo y cubre ambas vías + la herencia.
  const ids = players.map((p) => p.id);

  const ratedIds = new Set<string>();
  if (ids.length > 0) {
    const { data: rated } = await supabase
      .from("player_change_requests")
      .select("player_id")
      .eq("action_type", "update_sensitive_fields")
      .neq("status", "rejected")
      .in("player_id", ids);
    for (const r of rated ?? []) if (r.player_id) ratedIds.add(r.player_id);
  }

  const withFlag = players.map((p) => ({
    ...p,
    sinCalificar: p.rating_confidence === "baja" && !ratedIds.has(p.id),
  }));
  const visiblePlayers = sinCalificarFilter ? withFlag.filter((p) => p.sinCalificar) : withFlag;

  // Las solicitudes create_player son propuestas globales (no por grupo ni con
  // rating): solo tienen sentido en la vista Pendientes "pura".
  const includeCreateRequests = statusFilter === "pending" && !grupoFilter && !sinCalificarFilter;
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

  // Para la card "Agregar jugador": los mismos grupos gestionables (RLS).
  const gruposGestionables: AgregarJugadorGrupo[] = canManage ? gruposFiltro : [];

  // Hrefs que preservan los filtros activos (status + grupo + sin_calificar).
  const makeHref = (over: { status?: PlayerStatus | null; sin?: boolean }): string => {
    const sp = new URLSearchParams();
    const st = over.status !== undefined ? over.status : statusFilter;
    if (st) sp.set("status", st);
    if (grupoFilter) sp.set("grupo", grupoFilter);
    const sin = over.sin !== undefined ? over.sin : sinCalificarFilter;
    if (sin) sp.set("sin_calificar", "1");
    const qs = sp.toString();
    return qs ? `/jugadores?${qs}` : "/jugadores";
  };

  const isEmpty = visiblePlayers.length === 0 && createRequests.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Jugadores</h1>
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

      {canManage ? <AgregarJugadorCard grupos={gruposGestionables} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <GrupoFilter
          grupos={gruposFiltro}
          value={grupoFilter}
          status={statusFilter}
          sin={sinCalificarFilter}
        />
        <Link
          href={makeHref({ sin: !sinCalificarFilter })}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition ${
            sinCalificarFilter
              ? "bg-amber-100 text-amber-800 ring-amber-300"
              : "bg-white text-neutral-600 ring-neutral-300 hover:bg-neutral-50"
          }`}
        >
          Sin calificar
        </Link>
      </div>

      <nav className="-mb-px flex gap-2 overflow-x-auto border-b border-neutral-200">
        {FILTERS.map((opt) => {
          const active = opt.value === "all" ? !statusFilter : statusFilter === opt.value;
          const href = makeHref({ status: opt.value === "all" ? null : opt.value });
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
          {sinCalificarFilter
            ? "No hay jugadores sin calificar con estos filtros."
            : grupoFilter
              ? "Este grupo no tiene jugadores con estos filtros."
              : statusFilter
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
          <PlayersListFilterable players={visiblePlayers} />
        </>
      )}
    </div>
  );
}
