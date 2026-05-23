"use client";

import { useActionState } from "react";

import { updatePrivateNotes, type PrivateNotesState } from "./actions";

type Props = {
  playerId: string;
  initial: string;
};

export function PrivateNotesForm({ playerId, initial }: Props) {
  const [state, formAction, pending] = useActionState<PrivateNotesState, FormData>(
    updatePrivateNotes,
    null,
  );

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Notas privadas
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        Solo visibles para admin y veedor. Edita libremente: no pasa por aprobación.
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="player_id" value={playerId} />
        <textarea
          name="private_notes"
          rows={4}
          defaultValue={initial}
          className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          placeholder="Sin notas todavía. Escribí algo y guardá."
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
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
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Guardar notas"}
          </button>
        </div>
      </form>
    </section>
  );
}
