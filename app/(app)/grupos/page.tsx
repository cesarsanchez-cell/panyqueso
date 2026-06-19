import Link from "next/link";

import { requireRole } from "@/lib/auth/require-role";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { NewGrupoForm } from "./new-grupo-form";

type GrupoStatus = Database["public"]["Enums"]["grupo_status"];

const STATUS_LABEL: Record<GrupoStatus, string> = {
  activo: "Activo",
  archivado: "Archivado",
};

const STATUS_BADGE: Record<GrupoStatus, string> = {
  activo: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  archivado: "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200",
};

const DIA_LABEL = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

function formatHora(raw: string): string {
  return raw.slice(0, 5);
}

export default async function GruposPage() {
  const ctx = await requireRole(["admin", "coordinador"]);
  const isAdmin = ctx.profile.role === "admin";

  const supabase = await createClient();

  const [
    { data: grupos, error: gruposErr },
    { data: lugares, error: lugaresErr },
    { data: coordRows },
  ] = await Promise.all([
    supabase
      .from("grupos")
      .select(
        "id, nombre, dia_semana, hora, cupo_titulares, status, lugar:lugares!lugar_id(nombre)",
      )
      .order("status", { ascending: true })
      .order("dia_semana", { ascending: true })
      .order("hora", { ascending: true }),
    supabase.from("lugares").select("id, nombre").order("nombre", { ascending: true }),
    // El coordinador solo gestiona los grupos que coordina. La RLS le deja LEER
    // también los grupos donde es miembro (vista de jugador), así que sin este
    // filtro el listado de gestión mostraba grupos que no coordina y que, al
    // entrar, caen en notFound() (ver guard en /grupos/[id]).
    isAdmin
      ? Promise.resolve({ data: null })
      : supabase.from("coordinador_grupos").select("grupo_id").eq("profile_id", ctx.userId),
  ]);

  if (gruposErr) {
    throw new Error(`No se pudieron cargar los grupos: ${gruposErr.message}`);
  }
  if (lugaresErr) {
    throw new Error(`No se pudieron cargar los lugares: ${lugaresErr.message}`);
  }

  // admin = todos; coordinador = solo los que coordina.
  const managedSet = isAdmin ? null : new Set((coordRows ?? []).map((r) => r.grupo_id));
  const grupoList = (grupos ?? []).filter((g) => managedSet === null || managedSet.has(g.id));
  const lugarList = lugares ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Grupos</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Grupos recurrentes (mismo lugar, día y hora). Cada grupo administra titulares y una lista
          de espera FIFO que persiste semana a semana.
        </p>
      </div>

      {isAdmin ? (
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Nuevo grupo
          </h2>
          <div className="mt-4">
            <NewGrupoForm lugares={lugarList} />
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          {grupoList.length === 1 ? "1 grupo" : `${grupoList.length} grupos`}
        </h2>
        {grupoList.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            {isAdmin
              ? "Sin grupos todavía. Cargá el primero arriba."
              : "No coordinás ningún grupo."}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100">
            {grupoList.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/grupos/${g.id}`}
                  className="block py-3 transition hover:bg-neutral-50"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-900">{g.nombre}</p>
                      <p className="text-xs text-neutral-500">
                        {DIA_LABEL[g.dia_semana]} {formatHora(g.hora)} · {g.lugar?.nombre ?? "—"} ·
                        cupo {g.cupo_titulares}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[g.status]}`}
                    >
                      {STATUS_LABEL[g.status]}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
