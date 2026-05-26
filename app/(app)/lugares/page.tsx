import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

import { NewLugarForm } from "./new-lugar-form";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function LugaresPage() {
  await requireRole("admin");

  const supabase = await createClient();
  const { data: lugares, error } = await supabase
    .from("lugares")
    .select(
      "id, nombre, ubicacion_maps_url, created_at, created_by, creator:profiles!created_by(nombre)",
    )
    .order("nombre", { ascending: true });

  if (error) {
    throw new Error(`No se pudieron cargar los lugares: ${error.message}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Lugares</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Catálogo de canchas disponibles para asignar a una convocatoria.
        </p>
      </div>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Nuevo lugar
        </h2>
        <div className="mt-3">
          <NewLugarForm />
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          {lugares.length === 1 ? "1 lugar registrado" : `${lugares.length} lugares registrados`}
        </h2>
        {lugares.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            Aún no hay lugares. Cargá el primero arriba.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100">
            {lugares.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-900">{l.nombre}</p>
                  <p className="text-xs text-neutral-500">
                    Creado por {l.creator?.nombre ?? "—"} · {formatDate(l.created_at)}
                  </p>
                  {l.ubicacion_maps_url ? (
                    <a
                      href={l.ubicacion_maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-xs text-neutral-700 underline transition hover:text-neutral-900"
                    >
                      Ver en Maps ↗
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
