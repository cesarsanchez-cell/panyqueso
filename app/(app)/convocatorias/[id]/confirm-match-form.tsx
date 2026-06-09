"use client";

import { useActionState } from "react";

import { confirmMatch, type ConfirmMatchState } from "./confirm-actions";

export function ConfirmMatchForm({
  convocatoriaId,
  unplayedPreviousFecha,
}: {
  convocatoriaId: string;
  // Si hay una convocatoria anterior del mismo grupo sin jugar, su fecha (ya
  // formateada). En ese caso no se puede cerrar esta todavía.
  unplayedPreviousFecha?: string | null;
}) {
  const [state, formAction, pending] = useActionState<ConfirmMatchState, FormData>(
    confirmMatch,
    null,
  );

  // Si volvió con warnings, mostramos un segundo botón para confirmar
  // explícitamente "con warnings".
  const hasWarnings = state && "warnings" in state && state.warnings.length > 0;

  const blocked = Boolean(unplayedPreviousFecha);

  if (blocked) {
    return (
      <p
        role="status"
        className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
      >
        No podés cerrar esta convocatoria todavía: primero jugá y cargá el resultado de la del{" "}
        <span className="font-semibold">{unplayedPreviousFecha}</span> (mismo grupo).
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {state && "error" in state ? (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.error}
        </p>
      ) : null}

      {hasWarnings ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-medium">Avisos antes de confirmar:</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {state.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <form action={formAction} className="mt-3">
            <input type="hidden" name="convocatoria_id" value={convocatoriaId} />
            <input type="hidden" name="force_with_warnings" value="1" />
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Confirmando…" : "Confirmar igual (con avisos)"}
            </button>
          </form>
        </div>
      ) : null}

      {!hasWarnings ? (
        <form action={formAction} className="flex items-start gap-3">
          <input type="hidden" name="convocatoria_id" value={convocatoriaId} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Confirmando…" : "Confirmar match"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
