import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

function formatFecha(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type Resultado = "ganado" | "empate" | "perdido" | "sin_resultado";

const RESULTADO_META: Record<Resultado, { label: string; className: string }> = {
  ganado: { label: "Ganado", className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  empate: { label: "Empate", className: "bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200" },
  perdido: { label: "Perdido", className: "bg-red-50 text-red-700 ring-1 ring-red-200" },
  sin_resultado: {
    label: "Sin resultado",
    className: "bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200",
  },
};

function asResultado(value: string): Resultado {
  return value === "ganado" || value === "empate" || value === "perdido" ? value : "sin_resultado";
}

export default async function HistorialPage() {
  const ctx = await requireUser();

  if (ctx.profile.role !== "player") {
    redirect("/");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_match_history");

  if (error) {
    throw new Error(`No se pudo cargar tu historial: ${error.message}`);
  }

  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Mi historial</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Tus partidos jugados, por grupo. Con el tiempo se van a sumar más estadísticas.
        </p>
      </div>

      {rows.length === 0 ? (
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Todavía no jugaste partidos
          </h2>
          <p className="mt-3 text-sm text-neutral-500">
            Cuando juegues tu primer partido confirmado, va a aparecer acá con la fecha, el grupo y
            el resultado.
          </p>
        </section>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const meta = RESULTADO_META[asResultado(r.resultado)];
            return (
              <li
                key={r.match_id}
                className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">
                    {r.grupo_nombre ?? "Grupo"}
                  </p>
                  <p className="text-xs text-neutral-500">{formatFecha(r.fecha)}</p>
                  {r.video_resumen_url ? (
                    <a
                      href={r.video_resumen_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
                    >
                      🎥 Ver video
                    </a>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {r.goles > 0 ? (
                    <span className="text-xs font-medium text-neutral-700">
                      {r.goles} {r.goles === 1 ? "gol" : "goles"} ⚽
                    </span>
                  ) : null}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.className}`}
                  >
                    {meta.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
