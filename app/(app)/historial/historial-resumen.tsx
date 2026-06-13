// Bloques del "carné" del jugador, ahora POR GRUPO (FUT-115). Mezclar goles /
// triunfos / figuras de grupos que no se conocen no significa nada, así que el
// resumen vive dentro de la tarjeta de cada grupo. Se calcula a partir de las
// mismas filas de get_my_match_history (sin DB nueva). Nunca expone rating
// interno ni nada sensible (CLAUDE.md).

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

export function StatTile({
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

// Las tiles de stats de UN grupo (sin tarjeta propia: van dentro de la tarjeta
// del grupo). El % de victorias y las insignias los muestra la tarjeta.
export function ResumenTiles({ resumen }: { resumen: HistorialResumenData }) {
  const { jugados, ganados, empates, perdidos, goles, asistencias, golesEnContra, figuras } =
    resumen;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
    </>
  );
}
