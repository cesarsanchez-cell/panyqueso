import { playerLabel } from "@/lib/players/label";

export type ProdeTablaRow = {
  playerId: string;
  nombre: string;
  apodo: string | null;
  puntos: number;
  aciertosExactos: number;
  pronosticos: number;
};

export type ProdeTablaGrupo = {
  grupoId: string;
  grupoNombre: string;
  rows: ProdeTablaRow[];
};

// La tabla en sí (un grupo). Reutilizable: la usa el jugador en /historial y el
// admin en el detalle del grupo. Resalta la fila de myPlayerId (null = nadie).
export function ProdeTablaTable({
  rows,
  myPlayerId,
}: {
  rows: ProdeTablaRow[];
  myPlayerId: string | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
            <th className="py-1 pr-2 font-medium">#</th>
            <th className="py-1 pr-2 font-medium">Jugador</th>
            <th className="py-1 px-2 text-center font-medium" title="Pronósticos">
              PJ
            </th>
            <th className="py-1 px-2 text-center font-medium" title="Resultados exactos">
              🎯
            </th>
            <th className="py-1 pl-2 text-right font-medium">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const esMio = r.playerId === myPlayerId;
            return (
              <tr
                key={r.playerId}
                className={`border-b border-neutral-100 ${
                  esMio ? "bg-indigo-50 font-semibold text-indigo-900" : "text-neutral-800"
                }`}
              >
                <td className="py-1.5 pr-2 tabular-nums text-neutral-500">{i + 1}</td>
                <td className="py-1.5 pr-2">
                  {playerLabel(r.nombre, r.apodo)}
                  {esMio ? <span className="ml-1 text-xs text-indigo-700">· vos</span> : null}
                </td>
                <td className="py-1.5 px-2 text-center tabular-nums">{r.pronosticos}</td>
                <td className="py-1.5 px-2 text-center tabular-nums">{r.aciertosExactos}</td>
                <td className="py-1.5 pl-2 text-right font-semibold tabular-nums">{r.puntos}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
