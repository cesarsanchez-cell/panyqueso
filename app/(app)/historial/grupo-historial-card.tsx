import { computeBadges } from "@/lib/badges/compute";

import { FechaCard, type FechaPersonal, type FechaResumen } from "./fecha-card";
import { ResumenTiles, type HistorialResumenData } from "./historial-resumen";
import { ProdeTablaTable, type ProdeTablaRow } from "./prode-tabla";

export type FechaEntry = {
  resumen: FechaResumen;
  personal?: FechaPersonal;
};

// Tarjeta de UN grupo en /historial (FUT-115/116): cada grupo es su mundo.
// Adentro: TU resumen (V/E/D + goles), tus insignias, la tabla de Prode del
// grupo y TODAS las fechas jugadas del grupo (las hayas jugado o no). Las fechas
// que jugaste muestran tu overlay (resultado/goles + votaciones abiertas).
export function GrupoHistorialCard({
  grupoNombre,
  resumen,
  prodeRows,
  myPlayerId,
  year,
  fechas,
}: {
  grupoNombre: string;
  resumen: HistorialResumenData;
  prodeRows: ProdeTablaRow[];
  myPlayerId: string | null;
  year: number;
  fechas: FechaEntry[];
}) {
  const conResultado = resumen.ganados + resumen.empates + resumen.perdidos;
  const winPct = conResultado > 0 ? Math.round((resumen.ganados / conResultado) * 100) : null;
  const badges = computeBadges({
    ganados: resumen.ganados,
    goles: resumen.goles,
    figuras: resumen.figuras,
  });

  return (
    <section className="space-y-5 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight text-neutral-900">{grupoNombre}</h2>
        {winPct !== null ? (
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
            {winPct}% de victorias
          </span>
        ) : null}
      </div>

      {resumen.jugados > 0 ? <ResumenTiles resumen={resumen} /> : null}

      {badges.length > 0 ? (
        <ul className="flex flex-wrap gap-3">
          {badges.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
            >
              <span className="text-2xl leading-none" aria-hidden="true">
                {b.emoji}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-amber-900">{b.title}</span>
                <span className="block text-xs text-amber-700">{b.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {prodeRows.length > 0 ? (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            🔮 Tabla del Prode {year}
          </h3>
          <p className="mt-1 text-xs text-neutral-500">
            Puntos por acertar el resultado: 3 si lo clavás, 1 si acertás quién gana.
          </p>
          <div className="mt-3">
            <ProdeTablaTable rows={prodeRows} myPlayerId={myPlayerId} />
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Fechas</h3>
        {fechas.length === 0 ? (
          <p className="mt-2 text-xs text-neutral-500">
            Todavía no hay fechas jugadas en este grupo.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {fechas.map((f) => (
              <FechaCard
                key={f.resumen.matchId}
                fecha={f.resumen}
                personal={f.personal}
                myPlayerId={myPlayerId}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
