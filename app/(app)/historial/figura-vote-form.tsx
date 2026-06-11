"use client";

import { useActionState } from "react";

import { playerLabel } from "@/lib/players/label";

import { castFiguraVote, type VoteState } from "./figura-vote-actions";

export type VoteCandidate = { playerId: string; nombre: string; apodo: string | null };

const selectClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

// "jueves 12 de jun., 20:00" — la figura se revela recién cuando cierra.
function formatCierre(iso: string): string {
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

// Selector para que el jugador vote la figura de un partido que jugó, mientras
// la votación esté abierta. Se puede votar a uno mismo. El voto es editable.
// La figura se revela recién cuando cierra la votación (no se ve el provisorio).
export function FiguraVoteForm({
  matchId,
  candidates,
  currentVote,
  closesAt,
}: {
  matchId: string;
  candidates: VoteCandidate[];
  currentVote: string | null;
  closesAt: string | null;
}) {
  const [state, formAction, pending] = useActionState<VoteState, FormData>(castFiguraVote, null);
  const cierre = closesAt ? formatCierre(closesAt) : "";

  return (
    <form action={formAction} className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3">
      <input type="hidden" name="match_id" value={matchId} />
      <label
        htmlFor={`figura_vote_${matchId}`}
        className="block text-xs font-semibold text-amber-900"
      >
        ⭐ Votá la figura del partido
      </label>
      {cierre ? (
        <p className="mt-0.5 text-[11px] text-amber-700">
          La votación cierra el {cierre} hs — ahí se revela la figura.
        </p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <select
          key={currentVote ?? "empty"}
          id={`figura_vote_${matchId}`}
          name="voted_player_id"
          defaultValue={currentVote ?? ""}
          className={selectClass + " sm:w-auto"}
        >
          <option value="" disabled>
            Elegí…
          </option>
          {candidates.map((c) => (
            <option key={c.playerId} value={c.playerId}>
              {playerLabel(c.nombre, c.apodo)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Votando…" : currentVote ? "Cambiar voto" : "Votar"}
        </button>
      </div>
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
    </form>
  );
}
