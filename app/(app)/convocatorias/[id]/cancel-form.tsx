"use client";

import { useActionState } from "react";

import { cancelConvocatoria, type MutationState } from "./actions";

export function CancelForm({ convocatoriaId }: { convocatoriaId: string }) {
  const [state, formAction, pending] = useActionState<MutationState, FormData>(
    cancelConvocatoria,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="convocatoria_id" value={convocatoriaId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Cancelando…" : "Cancelar convocatoria"}
      </button>
      {state && "error" in state ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
