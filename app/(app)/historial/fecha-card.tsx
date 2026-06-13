"use client";

import { useState } from "react";

import { playerLabel } from "@/lib/players/label";

import { loadFechaStats, type FechaStatRow } from "./actions";
import { AwardVoteForm } from "./award-vote-form";
import { FiguraVoteForm, type VoteCandidate } from "./figura-vote-form";

export type FechaResumen = {
  matchId: string;
  fecha: string;
  scoreA: number | null;
  scoreB: number | null;
  winner: string | null; // 'a' | 'b' | 'empate' | null
  figuraNombre: string | null;
  carniceroNombre: string | null;
  pinochoHabilitado: boolean;
  pinochoNombre: string | null;
  videoUrl: string | null;
};

// Datos PERSONALES del que mira, solo si jugó esa fecha. Permite el overlay
// (tu resultado, tus goles) y las votaciones abiertas (figura/premios).
export type FechaPersonal = {
  resultado: string; // ganado | empate | perdido | sin_resultado
  miGoles: number;
  miAsist: number;
  miEnContra: number;
  figuraEsMia: boolean;
  votingOpen: boolean;
  candidates: VoteCandidate[];
  figuraCierra: string | null;
  miVotoFigura: string | null;
  miVotoCarnicero: string | null;
  miVotoPinocho: string | null;
};

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

const MI_RESULTADO_META: Record<string, { label: string; className: string }> = {
  ganado: { label: "Ganaste", className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  empate: {
    label: "Empataste",
    className: "bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200",
  },
  perdido: { label: "Perdiste", className: "bg-red-50 text-red-700 ring-1 ring-red-200" },
};

function ScoreLine({ fecha }: { fecha: FechaResumen }) {
  if (fecha.winner === null && fecha.scoreA === null) {
    return <span className="text-sm font-medium text-neutral-500">Sin resultado</span>;
  }
  const aWins = fecha.winner === "a";
  const bWins = fecha.winner === "b";
  return (
    <span className="text-sm font-semibold text-neutral-900">
      <span className={aWins ? "text-emerald-700" : ""}>A {fecha.scoreA ?? "–"}</span>
      <span className="mx-1 text-neutral-400">–</span>
      <span className={bWins ? "text-emerald-700" : ""}>{fecha.scoreB ?? "–"} B</span>
    </span>
  );
}

function TeamColumn({
  label,
  rows,
  myPlayerId,
}: {
  label: string;
  rows: FechaStatRow[];
  myPlayerId: string | null;
}) {
  return (
    <div className="rounded bg-neutral-50 p-2">
      <p className="text-xs font-semibold text-neutral-600">{label}</p>
      {rows.length === 0 ? (
        <p className="mt-1 text-xs text-neutral-400">—</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {rows.map((r) => (
            <li
              key={r.playerId}
              className={`flex items-center justify-between gap-2 text-sm ${
                r.playerId === myPlayerId ? "font-semibold text-neutral-900" : "text-neutral-800"
              }`}
            >
              <span className="min-w-0 truncate">
                {r.isGoalkeeper ? "🧤 " : ""}
                {playerLabel(r.nombre, r.apodo)}
              </span>
              <span className="shrink-0 text-xs text-neutral-500">
                {r.goles > 0 ? `${r.goles}⚽ ` : ""}
                {r.asistencias > 0 ? `${r.asistencias}🅰️ ` : ""}
                {r.golesEnContra > 0 ? `${r.golesEnContra}🙈` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FechaCard({
  fecha,
  personal,
  myPlayerId,
}: {
  fecha: FechaResumen;
  personal?: FechaPersonal;
  myPlayerId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<FechaStatRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && stats === null && !loading) {
      setLoading(true);
      setError(null);
      try {
        setStats(await loadFechaStats(fecha.matchId));
      } catch {
        setError("No se pudo cargar el detalle.");
      } finally {
        setLoading(false);
      }
    }
  }

  const votingOpen = personal?.votingOpen && personal.candidates.length > 0;
  const miRes = personal ? MI_RESULTADO_META[personal.resultado] : undefined;
  const teamA = (stats ?? []).filter((r) => r.teamLabel === "A");
  const teamB = (stats ?? []).filter((r) => r.teamLabel === "B");
  const banco = (stats ?? []).filter((r) => r.teamLabel !== "A" && r.teamLabel !== "B");

  return (
    <li className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-neutral-500">{formatFecha(fecha.fecha)}</p>
          <div className="mt-0.5">
            <ScoreLine fecha={fecha} />
          </div>
          {fecha.figuraNombre ? (
            <p className="mt-1 text-xs text-neutral-500">⭐ Figura: {fecha.figuraNombre}</p>
          ) : null}
          {fecha.carniceroNombre ? (
            <p className="mt-1 text-xs text-neutral-500">🔪 Carnicero: {fecha.carniceroNombre}</p>
          ) : null}
          {fecha.pinochoHabilitado && fecha.pinochoNombre ? (
            <p className="mt-1 text-xs text-neutral-500">🪵 Pinocho: {fecha.pinochoNombre}</p>
          ) : null}
          {fecha.videoUrl ? (
            <a
              href={fecha.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
            >
              🎥 Ver video
            </a>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {personal ? (
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-sky-200">
              Jugaste
            </span>
          ) : null}
          {personal?.figuraEsMia ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">
              ⭐ Figura
            </span>
          ) : null}
          {miRes ? (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${miRes.className}`}>
              {miRes.label}
            </span>
          ) : null}
          {personal && (personal.miGoles > 0 || personal.miAsist > 0) ? (
            <span className="text-[11px] text-neutral-600">
              {personal.miGoles > 0 ? `${personal.miGoles}⚽ ` : ""}
              {personal.miAsist > 0 ? `${personal.miAsist}🅰️` : ""}
            </span>
          ) : null}
        </div>
      </div>

      {votingOpen ? (
        <>
          <FiguraVoteForm
            matchId={fecha.matchId}
            candidates={personal!.candidates}
            currentVote={personal!.miVotoFigura}
            closesAt={personal!.figuraCierra}
          />
          <AwardVoteForm
            matchId={fecha.matchId}
            categoria="carnicero"
            titulo="🔪 Votá al Carnicero (el más rudo)"
            candidates={personal!.candidates}
            currentVote={personal!.miVotoCarnicero}
          />
          {fecha.pinochoHabilitado ? (
            <AwardVoteForm
              matchId={fecha.matchId}
              categoria="pinocho"
              titulo="🪵 Votá al Pinocho (el peor)"
              candidates={personal!.candidates}
              currentVote={personal!.miVotoPinocho}
            />
          ) : null}
        </>
      ) : null}

      <button
        type="button"
        onClick={toggle}
        className="mt-3 text-xs font-medium text-neutral-600 underline transition hover:text-neutral-900"
      >
        {open ? "Ocultar jugadores y goles" : "Ver jugadores y goles"}
      </button>

      {open ? (
        <div className="mt-2">
          {loading ? (
            <p className="text-xs text-neutral-500">Cargando…</p>
          ) : error ? (
            <p className="text-xs text-red-600">{error}</p>
          ) : stats && stats.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <TeamColumn label="Equipo A" rows={teamA} myPlayerId={myPlayerId} />
              <TeamColumn label="Equipo B" rows={teamB} myPlayerId={myPlayerId} />
              {banco.length > 0 ? (
                <div className="sm:col-span-2">
                  <TeamColumn label="Banco" rows={banco} myPlayerId={myPlayerId} />
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-neutral-500">Sin detalle de jugadores.</p>
          )}
        </div>
      ) : null}
    </li>
  );
}
