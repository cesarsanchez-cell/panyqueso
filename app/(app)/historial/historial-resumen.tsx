import { computeBadges } from "@/lib/badges/compute";

// Resumen ("carné") del jugador, arriba de la lista de /historial (FUT-73).
// Se calcula a partir de las MISMAS filas que ya trae get_my_match_history,
// así que no requiere DB nueva. Muestra la realidad (V/E/D + %), a diferencia
// del panel "Tu actividad" de /mi-perfil que es solo positivo. Nunca expone
// rating interno ni nada sensible (CLAUDE.md).

export type HistorialResumenData = {
  jugados: number;
  ganados: number;
  empates: number;
  perdidos: number;
  goles: number;
  asistencias: number;
  golesEnContra: number;
  figuras: number;
};

function StatTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "win" | "draw" | "loss";
}) {
  const valueClass =
    tone === "win"
      ? "text-emerald-700"
      : tone === "loss"
        ? "text-red-600"
        : tone === "draw"
          ? "text-neutral-600"
          : "text-neutral-900";
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-center">
      <p className={`text-2xl font-bold tracking-tight ${valueClass}`}>{value}</p>
      <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
    </div>
  );
}

export function HistorialResumen({ resumen }: { resumen: HistorialResumenData }) {
  const { jugados, ganados, empates, perdidos, goles, asistencias, golesEnContra, figuras } =
    resumen;
  const conResultado = ganados + empates + perdidos;
  const winPct = conResultado > 0 ? Math.round((ganados / conResultado) * 100) : null;
  const badges = computeBadges({ ganados, goles, figuras });

  return (
    <>
      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Tu resumen
          </h2>
          {winPct !== null ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
              {winPct}% de victorias
            </span>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Jugados" value={jugados} />
          <StatTile label="Ganados" value={ganados} tone="win" />
          <StatTile label="Empates" value={empates} tone="draw" />
          <StatTile label="Perdidos" value={perdidos} tone="loss" />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Goles" value={goles} />
          <StatTile label="Asistencias" value={asistencias} />
          {figuras > 0 ? <StatTile label="⭐ Figura" value={figuras} /> : null}
          {golesEnContra > 0 ? <StatTile label="🙈 En contra" value={golesEnContra} /> : null}
        </div>
      </section>

      {badges.length > 0 ? (
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Tus insignias
          </h2>
          <ul className="mt-3 flex flex-wrap gap-3">
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
        </section>
      ) : null}
    </>
  );
}
