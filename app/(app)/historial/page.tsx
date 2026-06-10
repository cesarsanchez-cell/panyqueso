import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

import { FiguraVoteForm, type VoteCandidate } from "./figura-vote-form";
import { HistorialResumen, type HistorialResumenData } from "./historial-resumen";

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

  // Candidatos a figura (los que jugaron) para los partidos con la votación
  // abierta. Solo esos matches necesitan el selector; normalmente es 1.
  const candidatesByMatch: Record<string, VoteCandidate[]> = {};
  await Promise.all(
    rows
      .filter((r) => r.figura_votacion_abierta)
      .map(async (r) => {
        const { data: cands } = await supabase.rpc("get_figura_candidates", {
          p_match_id: r.match_id,
        });
        candidatesByMatch[r.match_id] = (cands ?? []).map((c) => ({
          playerId: c.player_id,
          nombre: c.nombre,
          apodo: c.apodo,
        }));
      }),
  );

  // Resumen ("carné"): se agrega a partir de las MISMAS filas que ya trajimos
  // para la lista (sin DB nueva). Muestra la realidad: V/E/D + %.
  const resumen: HistorialResumenData = {
    jugados: rows.length,
    ganados: rows.filter((r) => r.resultado === "ganado").length,
    empates: rows.filter((r) => r.resultado === "empate").length,
    perdidos: rows.filter((r) => r.resultado === "perdido").length,
    goles: rows.reduce((acc, r) => acc + (r.goles ?? 0), 0),
    asistencias: rows.reduce((acc, r) => acc + (r.asistencias ?? 0), 0),
    golesEnContra: rows.reduce((acc, r) => acc + (r.goles_en_contra ?? 0), 0),
    figuras: rows.filter((r) => r.figura_es_mia).length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Mi Actividad</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Tu resumen y tus partidos jugados, por grupo. Con el tiempo se van a sumar más
          estadísticas.
        </p>
      </div>

      {rows.length > 0 ? <HistorialResumen resumen={resumen} /> : null}

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
                className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900">
                      {r.grupo_nombre ?? "Grupo"}
                    </p>
                    <p className="text-xs text-neutral-500">{formatFecha(r.fecha)}</p>
                    {r.figura_es_mia ? (
                      <p className="mt-1 text-xs font-semibold text-amber-700">
                        ⭐ Fuiste la figura del partido
                      </p>
                    ) : r.figura_nombre ? (
                      <p className="mt-1 text-xs text-neutral-500">⭐ Figura: {r.figura_nombre}</p>
                    ) : null}
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
                    {r.figura_es_mia ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                        ⭐ Figura
                      </span>
                    ) : null}
                    {r.goles > 0 ? (
                      <span className="text-xs font-medium text-neutral-700">
                        {r.goles} {r.goles === 1 ? "gol" : "goles"} ⚽
                      </span>
                    ) : null}
                    {r.asistencias > 0 ? (
                      <span className="text-xs font-medium text-neutral-700">
                        {r.asistencias} {r.asistencias === 1 ? "asist." : "asist."} 🅰️
                      </span>
                    ) : null}
                    {r.goles_en_contra > 0 ? (
                      <span className="text-xs font-medium text-neutral-700">
                        {r.goles_en_contra} en contra 🙈
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.className}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                </div>
                {r.figura_votacion_abierta && (candidatesByMatch[r.match_id]?.length ?? 0) > 0 ? (
                  <FiguraVoteForm
                    matchId={r.match_id}
                    candidates={candidatesByMatch[r.match_id] ?? []}
                    currentVote={r.mi_voto_player_id}
                    closesAt={r.figura_votacion_cierra}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
