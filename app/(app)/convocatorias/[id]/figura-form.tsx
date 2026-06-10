"use client";

import { useActionState } from "react";

import { playerLabel } from "@/lib/players/label";

import { saveMatchFigura, type SaveFiguraState } from "./figura-actions";

export type FiguraOption = {
  playerId: string;
  nombre: string;
  apodo: string | null;
};

export type FiguraVote = {
  playerId: string;
  nombre: string;
  apodo: string | null;
  votos: number;
};

type Props = {
  convocatoriaId: string;
  players: FiguraOption[];
  initialFiguraId: string | null;
  votes: FiguraVote[];
};

const selectClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export function FiguraForm({ convocatoriaId, players, initialFiguraId, votes }: Props) {
  const [state, formAction, pending] = useActionState<SaveFiguraState, FormData>(
    saveMatchFigura,
    null,
  );

  // votes viene ordenado por votos desc (RPC get_figura_votes). El líder es
  // único si hay votos y el primero supera al segundo; si empatan, no hay líder
  // y el admin tiene que desempatar.
  const totalVotos = votes.reduce((acc, v) => acc + v.votos, 0);
  const [first, second] = votes;
  const leader = first && (!second || first.votos > second.votos) ? first : null;
  const hayEmpate = Boolean(first && second && first.votos === second.votos);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="convocatoria_id" value={convocatoriaId} />

      {totalVotos > 0 ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-xs font-semibold text-neutral-700">
            Votos de los jugadores ({totalVotos})
          </p>
          <ul className="mt-1.5 space-y-1 text-sm">
            {votes.map((v) => {
              const isLeader = leader?.playerId === v.playerId;
              return (
                <li key={v.playerId} className="flex items-center justify-between gap-2">
                  <span className={isLeader ? "font-semibold text-amber-800" : "text-neutral-800"}>
                    {isLeader ? "⭐ " : ""}
                    {playerLabel(v.nombre, v.apodo)}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {v.votos} {v.votos === 1 ? "voto" : "votos"}
                  </span>
                </li>
              );
            })}
          </ul>
          {hayEmpate ? (
            <p className="mt-2 text-xs text-amber-700">
              Hay empate en el primer puesto: elegí abajo para desempatar.
            </p>
          ) : leader && !initialFiguraId ? (
            <p className="mt-2 text-xs text-neutral-500">
              Sin override, la figura es el más votado ({playerLabel(leader.nombre, leader.apodo)}).
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-neutral-500">
          Todavía no hay votos. Gana el más votado cuando voten; si no, elegila a mano acá.
        </p>
      )}

      <div>
        <label htmlFor="figura_player_id" className="block text-xs font-medium text-neutral-700">
          {totalVotos > 0
            ? "Override / desempate (dejá sin asignar para respetar el voto)."
            : "Elegí la figura del partido (o dejala sin asignar)."}
        </label>
        <select
          id="figura_player_id"
          name="figura_player_id"
          defaultValue={initialFiguraId ?? ""}
          className={selectClass}
        >
          <option value="">— Sin figura —</option>
          {players.map((p) => (
            <option key={p.playerId} value={p.playerId}>
              {playerLabel(p.nombre, p.apodo)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar figura"}
        </button>
        {state && "error" in state ? (
          <p
            role="alert"
            aria-live="polite"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {state.error}
          </p>
        ) : null}
        {state && "success" in state ? (
          <p
            role="status"
            aria-live="polite"
            className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          >
            {state.success}
          </p>
        ) : null}
      </div>
    </form>
  );
}
