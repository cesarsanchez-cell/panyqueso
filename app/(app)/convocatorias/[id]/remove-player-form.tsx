"use client";

import { useActionState } from "react";

import { removePlayer, type MutationState } from "./actions";

export function RemovePlayerForm({
  convocatoriaId,
  convocatoriaPlayerId,
}: {
  convocatoriaId: string;
  convocatoriaPlayerId: string;
}) {
  const [state, formAction, pending] = useActionState<MutationState, FormData>(removePlayer, null);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="convocatoria_id" value={convocatoriaId} />
      <input type="hidden" name="convocatoria_player_id" value={convocatoriaPlayerId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Quitando…" : "Quitar"}
      </button>
      {state && "error" in state ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
