"use client";

import { useActionState } from "react";

import { playerLabel } from "@/lib/players/label";

import { castAwardVote, type AwardVoteState } from "./award-vote-actions";

export type AwardCandidate = { playerId: string; nombre: string; apodo: string | null };

const TONES = {
  carnicero: {
    box: "border-rose-200 bg-rose-50",
    label: "text-rose-900",
    btn: "bg-rose-600 hover:bg-rose-700",
    select: "focus:border-rose-600 focus:ring-rose-600",
  },
  pinocho: {
    box: "border-amber-200 bg-amber-50",
    label: "text-amber-900",
    btn: "bg-amber-700 hover:bg-amber-800",
    select: "focus:border-amber-700 focus:ring-amber-700",
  },
} as const;

// Selector genérico para votar un premio (carnicero/pinocho) de un partido que
// jugó el jugador, mientras la votación esté abierta (misma ventana que la
// figura). Se puede votar a uno mismo. Voto editable. El ganador se revela al
// cerrar.
export function AwardVoteForm({
  matchId,
  categoria,
  titulo,
  candidates,
  currentVote,
}: {
  matchId: string;
  categoria: "carnicero" | "pinocho";
  titulo: string;
  candidates: AwardCandidate[];
  currentVote: string | null;
}) {
  const [state, formAction, pending] = useActionState<AwardVoteState, FormData>(
    castAwardVote,
    null,
  );
  const tone = TONES[categoria];

  return (
    <form action={formAction} className={`mt-2 rounded-md border ${tone.box} p-3`}>
      <input type="hidden" name="match_id" value={matchId} />
      <input type="hidden" name="categoria" value={categoria} />
      <label
        htmlFor={`award_${categoria}_${matchId}`}
        className={`block text-xs font-semibold ${tone.label}`}
      >
        {titulo}
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <select
          // key atado al voto guardado: cuando el voto se guarda (currentVote
          // cambia), el select se re-monta mostrando al votado, sin que el reset
          // del form action de React 19 lo "limpie".
          key={currentVote ?? "empty"}
          id={`award_${categoria}_${matchId}`}
          name="voted_player_id"
          defaultValue={currentVote ?? ""}
          className={`mt-1 block w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 sm:w-auto ${tone.select}`}
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
          className={`rounded-md px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${tone.btn}`}
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
