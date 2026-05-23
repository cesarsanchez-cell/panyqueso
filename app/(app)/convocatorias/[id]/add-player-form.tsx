"use client";

import { useActionState } from "react";

import { addPlayer, type MutationState } from "./actions";

export function AddPlayerForm({
  convocatoriaId,
  playerId,
}: {
  convocatoriaId: string;
  playerId: string;
}) {
  const [state, formAction, pending] = useActionState<MutationState, FormData>(addPlayer, null);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="convocatoria_id" value={convocatoriaId} />
      <input type="hidden" name="player_id" value={playerId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Agregando…" : "Agregar"}
      </button>
      {state && "error" in state ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
