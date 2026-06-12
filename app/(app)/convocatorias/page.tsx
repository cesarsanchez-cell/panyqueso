import Link from "next/link";

import { requireRole } from "@/lib/auth/require-role";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Status = Database["public"]["Enums"]["convocatoria_status"];

type Tab = Status | "todas";

type SearchParams = { tab?: string };

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

const TABS: { value: Tab; label: string }[] = [
  { value: "abierta", label: "Abiertas" },
  { value: "cerrada", label: "Cerradas" },
  { value: "jugada", label: "Jugadas" },
  { value: "todas", label: "Todas" },
];

function parseTab(raw: string | undefined): Tab {
  // 'cancelada' ya no se produce (Bug 5): las convocatorias canceladas se
  // eliminan. Se conserva en el enum por compatibilidad, pero sin tab.
  if (raw === "cerrada" || raw === "jugada" || raw === "todas") return raw;
  return "abierta";
}

function buildHref(tab: Tab): string {
  return tab === "abierta" ? "/convocatorias" : `/convocatorias?tab=${tab}`;
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatHora(raw: string): string {
  // Postgres time se serializa "HH:MM:SS". Mostramos "HH:MM".
  return raw.slice(0, 5);
}

export default async function ConvocatoriasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requireRole(["admin", "veedor", "coordinador"]);
  const isAdmin = ctx.profile.role === "admin";

  const sp = await searchParams;
  const tab = parseTab(sp.tab);

  const supabase = await createClient();

  let query = supabase
    .from("convocatorias")
    .select(
      `id, fecha, hora, status, cupo_maximo, notas, created_at,
       grupo:grupos!grupo_id(nombre),
       lugar:lugares!lugar_id(nombre),
       creator:profiles!created_by(nombre)`,
    )
    .order("fecha", { ascending: false });

  if (tab !== "todas") {
    query = query.eq("status", tab);
  }

  const { data: convocatorias, error } = await query;

  if (error) {
    throw new Error(`No se pudieron cargar las convocatorias: ${error.message}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Convocatorias</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {convocatorias.length} {convocatorias.length === 1 ? "convocatoria" : "convocatorias"} ·{" "}
            {tab === "todas" ? "todas" : STATUS_LABEL[tab].toLowerCase() + "s"}
          </p>
        </div>
        {isAdmin ? (
          <Link
            href="/convocatorias/nueva"
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800"
          >
            Nueva convocatoria
          </Link>
        ) : null}
      </div>

      <nav
        aria-label="Filtros por estado"
        className="flex flex-wrap gap-1 border-b border-neutral-200"
      >
        {TABS.map((t) => {
          const active = t.value === tab;
          return (
            <Link
              key={t.value}
              href={buildHref(t.value)}
              className={
                active
                  ? "border-b-2 border-neutral-900 px-3 py-2 text-sm font-semibold text-neutral-900"
                  : "border-b-2 border-transparent px-3 py-2 text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
              }
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {convocatorias.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          {tab === "abierta"
            ? "No hay convocatorias abiertas."
            : "No hay convocatorias con ese estado."}
        </div>
      ) : (
        <ul className="space-y-3">
          {convocatorias.map((c) => (
            <li key={c.id}>
              <Link
                href={`/convocatorias/${c.id}`}
                className="block rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">
                      {c.grupo?.nombre ?? "Convocatoria suelta"}
                    </p>
                    <p className="mt-0.5 text-sm text-neutral-600">
                      {formatDate(c.fecha)} · {formatHora(c.hora)}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {c.lugar?.nombre ?? "Lugar sin definir"} · cupo {c.cupo_maximo}
                    </p>
                    {c.notas ? (
                      <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{c.notas}</p>
                    ) : null}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[c.status]}`}
                  >
                    {STATUS_LABEL[c.status]}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
