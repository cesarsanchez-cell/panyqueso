"use client";

import { useActionState } from "react";

import { resetProde, type ResetProdeState } from "./prode-reset-actions";

// Botón destructivo: borra los pronósticos del Prode del año en este grupo.
// Pide confirmación antes de disparar la server action.
export function ProdeResetForm({ grupoId, year }: { grupoId: string; year: number }) {
  const [state, formAction, pending] = useActionState<ResetProdeState, FormData>(resetProde, null);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `¿Resetear el Prode ${year}? Se borran todos los pronósticos de este año en el grupo. No se puede deshacer.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="grupo_id" value={grupoId} />
      <input type="hidden" name="year" value={year} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Reseteando…" : `Resetear Prode ${year}`}
      </button>
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
