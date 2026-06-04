"use client";

import { useActionState } from "react";

import { playerLabel } from "@/lib/players/label";

import { saveMatchFigura, type SaveFiguraState } from "./figura-actions";

export type FiguraOption = {
  playerId: string;
  nombre: string;
  apodo: string | null;
};

type Props = {
  convocatoriaId: string;
  players: FiguraOption[];
  initialFiguraId: string | null;
};

const selectClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export function FiguraForm({ convocatoriaId, players, initialFiguraId }: Props) {
  const [state, formAction, pending] = useActionState<SaveFiguraState, FormData>(
    saveMatchFigura,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="convocatoria_id" value={convocatoriaId} />

      <div>
        <label htmlFor="figura_player_id" className="block text-xs font-medium text-neutral-700">
          Elegí la figura del partido (o dejala sin asignar).
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
