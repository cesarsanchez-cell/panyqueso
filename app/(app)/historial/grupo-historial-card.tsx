import { computeBadges } from "@/lib/badges/compute";

import { AwardVoteForm } from "./award-vote-form";
import { FiguraVoteForm, type VoteCandidate } from "./figura-vote-form";
import { ResumenTiles, type HistorialResumenData } from "./historial-resumen";
import { ProdeTablaTable, type ProdeTablaRow } from "./prode-tabla";

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

export type HistMatchRow = {
  match_id: string;
  fecha: string;
  resultado: string;
  goles: number;
  asistencias: number;
  goles_en_contra: number;
  video_resumen_url: string | null;
  figura_nombre: string | null;
  figura_es_mia: boolean;
  figura_votacion_abierta: boolean;
  figura_votacion_cierra: string | null;
  mi_voto_player_id: string | null;
};

export type AwardEntry =
  | {
      carnicero_nombre: string | null;
      mi_voto_carnicero: string | null;
      pinocho_habilitado: boolean;
      pinocho_nombre: string | null;
      mi_voto_pinocho: string | null;
    }
  | undefined;

export type MatchEntry = {
  row: HistMatchRow;
  candidates: VoteCandidate[];
  award: AwardEntry;
  votingOpen: boolean;
};

// Tarjeta de UN grupo en /historial (FUT-115): cada grupo es su mundo. Adentro,
// su resumen, sus insignias, su Prode y sus partidos — nada se mezcla con otros
// grupos. Read-only salvo las votaciones (figura/premios) que siguen abiertas.
export function GrupoHistorialCard({
  grupoNombre,
  resumen,
  prodeRows,
  myPlayerId,
  year,
  matches,
}: {
  grupoNombre: string;
  resumen: HistorialResumenData;
  prodeRows: ProdeTablaRow[];
  myPlayerId: string | null;
  year: number;
  matches: MatchEntry[];
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

      <ResumenTiles resumen={resumen} />

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
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Partidos</h3>
        <ul className="mt-2 space-y-2">
          {matches.map(({ row: r, candidates, award, votingOpen }) => {
            const meta = RESULTADO_META[asResultado(r.resultado)];
            return (
              <li key={r.match_id} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-neutral-500">{formatFecha(r.fecha)}</p>
                    {r.figura_es_mia ? (
                      <p className="mt-1 text-xs font-semibold text-amber-700">
                        ⭐ Fuiste la figura del partido
                      </p>
                    ) : r.figura_nombre ? (
                      <p className="mt-1 text-xs text-neutral-500">⭐ Figura: {r.figura_nombre}</p>
                    ) : null}
                    {award?.carnicero_nombre ? (
                      <p className="mt-1 text-xs text-neutral-500">
                        🔪 Carnicero: {award.carnicero_nombre}
                      </p>
                    ) : null}
                    {award?.pinocho_nombre ? (
                      <p className="mt-1 text-xs text-neutral-500">
                        🪵 Pinocho: {award.pinocho_nombre}
                      </p>
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
                        {r.asistencias} asist. 🅰️
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
                {votingOpen ? (
                  <FiguraVoteForm
                    matchId={r.match_id}
                    candidates={candidates}
                    currentVote={r.mi_voto_player_id}
                    closesAt={r.figura_votacion_cierra}
                  />
                ) : null}
                {votingOpen ? (
                  <AwardVoteForm
                    matchId={r.match_id}
                    categoria="carnicero"
                    titulo="🔪 Votá al Carnicero (el más rudo)"
                    candidates={candidates}
                    currentVote={award?.mi_voto_carnicero ?? null}
                  />
                ) : null}
                {votingOpen && award?.pinocho_habilitado ? (
                  <AwardVoteForm
                    matchId={r.match_id}
                    categoria="pinocho"
                    titulo="🪵 Votá al Pinocho (el peor)"
                    candidates={candidates}
                    currentVote={award?.mi_voto_pinocho ?? null}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
