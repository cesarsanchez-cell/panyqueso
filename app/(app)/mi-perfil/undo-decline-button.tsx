"use client";

import { useActionState } from "react";

import { undoDeclineConvocatoria, type OneClickState } from "./actions";

type Props = {
  convocatoriaId: string;
  label: string;
};

export function UndoDeclineButton({ convocatoriaId, label }: Props) {
  const [state, formAction, pending] = useActionState<OneClickState, FormData>(
    undoDeclineConvocatoria,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="convocatoria_id" value={convocatoriaId} />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-emerald-600 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Volviendo…" : label}
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
    </form>
  );
}
