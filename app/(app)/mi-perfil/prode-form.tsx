"use client";

import { useActionState } from "react";

import { playerLabel } from "@/lib/players/label";

import { castProdePrediction, type ProdeState } from "./prode-actions";

export type ProdePrediction = {
  playerId: string;
  nombre: string;
  apodo: string | null;
  predA: number;
  predB: number;
  puntos: number | null;
  esMio: boolean;
};

export type ProdeInfo = {
  matchId: string;
  abierto: boolean;
  kickoff: string | null;
  miPredA: number | null;
  miPredB: number | null;
  resultA: number | null;
  resultB: number | null;
  predicciones: ProdePrediction[];
};

const scoreInputClass =
  "w-12 rounded-md border border-indigo-300 bg-white px-2 py-1.5 text-center text-sm font-semibold shadow-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600";

// "jueves 12 de jun., 20:00" — el prode cierra al empezar el partido.
function formatKickoff(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function puntosBadge(puntos: number | null) {
  if (puntos === null) return null;
  const cls =
    puntos === 3
      ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
      : puntos === 1
        ? "bg-amber-100 text-amber-800 ring-amber-200"
        : "bg-neutral-100 text-neutral-500 ring-neutral-200";
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${cls}`}>
      {puntos === 0 ? "0 pts" : `+${puntos}`}
    </span>
  );
}

// El Prode 🔮: cada miembro del grupo pronostica el resultado del partido,
// juegue o no. Editable hasta el inicio del partido. Al cerrar se revelan todos
// los pronósticos y, si ya hay resultado, los puntos (3 exacto / 1 ganador).
export function ProdeForm({ info }: { info: ProdeInfo }) {
  const [state, formAction, pending] = useActionState<ProdeState, FormData>(
    castProdePrediction,
    null,
  );

  const kickoff = info.kickoff ? formatKickoff(info.kickoff) : "";
  const tienePred = info.miPredA !== null && info.miPredB !== null;
  const hayResultado = info.resultA !== null && info.resultB !== null;

  return (
    <div className="mt-4 rounded-md border border-indigo-200 bg-indigo-50 p-3">
      <p className="text-xs font-semibold text-indigo-900">🔮 El Prode — ¿cómo termina?</p>

      {info.abierto ? (
        <>
          {kickoff ? (
            <p className="mt-0.5 text-[11px] text-indigo-700">
              Cierra cuando empieza el partido ({kickoff} hs). 3 pts si clavás el resultado, 1 pt si
              acertás quién gana.
            </p>
          ) : null}
          <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="match_id" value={info.matchId} />
            <span className="text-xs font-medium text-indigo-900">Equipo A</span>
            <input
              type="number"
              name="score_a"
              min={0}
              max={99}
              inputMode="numeric"
              defaultValue={info.miPredA ?? ""}
              aria-label="Goles Equipo A"
              className={scoreInputClass}
            />
            <span className="text-sm font-semibold text-indigo-400">–</span>
            <input
              type="number"
              name="score_b"
              min={0}
              max={99}
              inputMode="numeric"
              defaultValue={info.miPredB ?? ""}
              aria-label="Goles Equipo B"
              className={scoreInputClass}
            />
            <span className="text-xs font-medium text-indigo-900">Equipo B</span>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Guardando…" : tienePred ? "Cambiar" : "Pronosticar"}
            </button>
          </form>
          {state && "error" in state ? (
            <p role="alert" className="mt-2 text-xs text-red-700">
              {state.error}
            </p>
          ) : null}
          {state && "success" in state ? (
            <p role="status" className="mt-2 text-xs text-emerald-700">
              {state.success}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-0.5 text-[11px] text-indigo-700">
            {hayResultado
              ? `Resultado: Equipo A ${info.resultA} – ${info.resultB} Equipo B`
              : "El Prode cerró. Esperando el resultado del partido…"}
          </p>
          {info.predicciones.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-500">Nadie pronosticó este partido.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {info.predicciones.map((p) => (
                <li
                  key={p.playerId}
                  className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-sm ${
                    p.esMio
                      ? "bg-white font-semibold text-indigo-900 ring-1 ring-indigo-100"
                      : "text-neutral-800"
                  }`}
                >
                  <span className="min-w-0 truncate">
                    {playerLabel(p.nombre, p.apodo)}
                    {p.esMio ? <span className="ml-1 text-xs text-indigo-700">· vos</span> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums text-neutral-700">
                      {p.predA} – {p.predB}
                    </span>
                    {puntosBadge(p.puntos)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
