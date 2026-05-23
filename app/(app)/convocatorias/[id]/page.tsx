import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/require-role";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { AddPlayerForm } from "./add-player-form";
import { CancelForm } from "./cancel-form";
import { RemovePlayerForm } from "./remove-player-form";

type Status = Database["public"]["Enums"]["convocatoria_status"];
type RoleField = Database["public"]["Enums"]["player_role_field"];
type PositionPref = Database["public"]["Enums"]["position_pref"];

type SearchParams = { q?: string; rol?: string; pos?: string };

const STATUS_LABEL: Record<Status, string> = {
  abierta: "Abierta",
  cerrada: "Cerrada",
  jugada: "Jugada",
  cancelada: "Cancelada",
};

const STATUS_BADGE: Record<Status, string> = {
  abierta: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  cerrada: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  jugada: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  cancelada: "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200",
};

const ROLE_LABEL: Record<RoleField, string> = {
  arquero: "Arquero",
  jugador_campo: "Jugador de campo",
  mixto: "Mixto",
};

const POSITION_LABEL: Record<PositionPref, string> = {
  defensor: "Defensor",
  mediocampista: "Mediocampista",
  delantero: "Delantero",
};

const ROLES: readonly RoleField[] = ["arquero", "jugador_campo", "mixto"];
const POSITIONS: readonly PositionPref[] = ["defensor", "mediocampista", "delantero"];

function parseRol(raw: string | undefined): RoleField | null {
  return (ROLES as readonly string[]).includes(raw ?? "") ? (raw as RoleField) : null;
}

function parsePos(raw: string | undefined): PositionPref | null {
  return (POSITIONS as readonly string[]).includes(raw ?? "") ? (raw as PositionPref) : null;
}

function buildSelectorHref(
  convocatoriaId: string,
  filters: { q?: string; rol?: RoleField | null; pos?: PositionPref | null },
): string {
  const qs = new URLSearchParams();
  if (filters.q) qs.set("q", filters.q);
  if (filters.rol) qs.set("rol", filters.rol);
  if (filters.pos) qs.set("pos", filters.pos);
  const s = qs.toString();
  return s ? `/convocatorias/${convocatoriaId}?${s}` : `/convocatorias/${convocatoriaId}`;
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatHora(raw: string): string {
  return raw.slice(0, 5);
}

export default async function ConvocatoriaDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requireRole(["admin", "veedor"]);
  const isAdmin = ctx.profile.role === "admin";
  const { id } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const { data: convocatoria, error } = await supabase
    .from("convocatorias")
    .select(
      `id, fecha, hora, status, cupo_maximo, notas, created_at,
       lugar:lugares!lugar_id(id, nombre),
       creator:profiles!created_by(nombre)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo cargar la convocatoria: ${error.message}`);
  }
  if (!convocatoria) {
    notFound();
  }

  const { data: convocadosRaw, error: convError } = await supabase
    .from("convocatoria_players")
    .select(
      `id, added_at, attendance_status,
       player:players!player_id(id, nombre, role_field, position_pref, status)`,
    )
    .eq("convocatoria_id", id)
    .order("added_at", { ascending: true });

  if (convError) {
    throw new Error(`No se pudieron cargar los convocados: ${convError.message}`);
  }

  const convocados = convocadosRaw ?? [];
  const convocadoIds = new Set(convocados.map((cp) => cp.player?.id).filter(Boolean) as string[]);

  const isOpen = convocatoria.status === "abierta";
  const overCupo = convocados.length > convocatoria.cupo_maximo;

  // Selector: solo se muestra si admin + abierta. Carga players approved
  // filtrados por searchParams, excluyendo los ya convocados.
  const showSelector = isAdmin && isOpen;

  const q = (sp.q ?? "").trim();
  const rol = parseRol(sp.rol);
  const pos = parsePos(sp.pos);

  let availablePlayers: Array<{
    id: string;
    nombre: string;
    role_field: RoleField;
    position_pref: PositionPref;
  }> = [];

  if (showSelector) {
    let q2 = supabase
      .from("players")
      .select("id, nombre, role_field, position_pref")
      .eq("status", "approved")
      .order("nombre", { ascending: true })
      .limit(50);

    if (q.length > 0) q2 = q2.ilike("nombre", `%${q}%`);
    if (rol) q2 = q2.eq("role_field", rol);
    if (pos) q2 = q2.eq("position_pref", pos);

    const { data, error: playersError } = await q2;
    if (playersError) {
      throw new Error(`No se pudieron cargar los jugadores: ${playersError.message}`);
    }
    availablePlayers = (data ?? []).filter((p) => !convocadoIds.has(p.id));
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/convocatorias"
          className="text-sm text-neutral-500 transition hover:text-neutral-700"
        >
          ← Volver al listado
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            {formatDate(convocatoria.fecha)} · {formatHora(convocatoria.hora)}
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            {convocatoria.lugar?.nombre ?? "Lugar sin definir"} · cupo {convocatoria.cupo_maximo}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[convocatoria.status]}`}
        >
          {STATUS_LABEL[convocatoria.status]}
        </span>
      </div>

      {convocatoria.notas ? (
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Notas</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-neutral-700">{convocatoria.notas}</p>
        </section>
      ) : null}

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Convocados
          </h2>
          <p className={`text-sm font-medium ${overCupo ? "text-amber-700" : "text-neutral-700"}`}>
            {convocados.length} de {convocatoria.cupo_maximo}
            {overCupo ? " · supera el cupo" : ""}
          </p>
        </div>

        {convocados.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Sin convocados todavía.</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100">
            {convocados.map((cp) => (
              <li key={cp.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">
                    {cp.player?.nombre ?? "—"}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {cp.player ? ROLE_LABEL[cp.player.role_field] : "—"} ·{" "}
                    {cp.player ? POSITION_LABEL[cp.player.position_pref] : "—"}
                  </p>
                </div>
                {showSelector ? (
                  <RemovePlayerForm convocatoriaId={convocatoria.id} convocatoriaPlayerId={cp.id} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {showSelector ? (
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Agregar jugadores
          </h2>
          <form method="get" className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label htmlFor="q" className="block text-xs font-medium text-neutral-700">
                Buscar por nombre
              </label>
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Ej: Juan"
                className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>
            <div>
              <label htmlFor="rol" className="block text-xs font-medium text-neutral-700">
                Rol
              </label>
              <select
                id="rol"
                name="rol"
                defaultValue={rol ?? ""}
                className="mt-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              >
                <option value="">Todos</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pos" className="block text-xs font-medium text-neutral-700">
                Posición
              </label>
              <select
                id="pos"
                name="pos"
                defaultValue={pos ?? ""}
                className="mt-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              >
                <option value="">Todas</option>
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {POSITION_LABEL[p]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50"
            >
              Filtrar
            </button>
            {(q || rol || pos) && (
              <Link
                href={buildSelectorHref(convocatoria.id, {})}
                className="text-xs font-medium text-neutral-500 underline transition hover:text-neutral-700"
              >
                Limpiar
              </Link>
            )}
          </form>

          {availablePlayers.length === 0 ? (
            <p className="mt-4 text-sm text-neutral-500">
              {q || rol || pos
                ? "Ningún jugador approved coincide con el filtro."
                : "No hay jugadores approved disponibles para convocar."}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-neutral-100">
              {availablePlayers.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900">{p.nombre}</p>
                    <p className="text-xs text-neutral-500">
                      {ROLE_LABEL[p.role_field]} · {POSITION_LABEL[p.position_pref]}
                    </p>
                  </div>
                  <AddPlayerForm convocatoriaId={convocatoria.id} playerId={p.id} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {isAdmin && isOpen ? (
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Cancelar convocatoria
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            La cancelación deja la convocatoria archivada con todos sus convocados, pero no se podrá
            editar más.
          </p>
          <div className="mt-3">
            <CancelForm convocatoriaId={convocatoria.id} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
