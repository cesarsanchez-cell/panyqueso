"use client";

import { useActionState } from "react";

import { updateLiderazgoCoefs, type CoefState } from "./actions";

const inputClass =
  "mt-1 w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export function LiderazgoCoefForm({ positivo, negativo }: { positivo: number; negativo: number }) {
  const [state, formAction, pending] = useActionState<CoefState, FormData>(
    updateLiderazgoCoefs,
    null,
  );

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-neutral-600">
          Coef. positivo (líder) — entre 1.00 y 5.00
          <input
            type="number"
            name="liderazgo_coef_positivo"
            min={1}
            max={5}
            step={0.05}
            defaultValue={positivo.toFixed(2)}
            required
            className={inputClass}
          />
        </label>
        <label className="block text-xs text-neutral-600">
          Coef. negativo (quejoso) — entre 0.10 y 1.00
          <input
            type="number"
            name="liderazgo_coef_negativo"
            min={0.1}
            max={1}
            step={0.05}
            defaultValue={negativo.toFixed(2)}
            required
            className={inputClass}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar coeficientes"}
        </button>
        {state && "error" in state ? (
          <p role="alert" className="text-xs text-red-700">
            {state.error}
          </p>
        ) : null}
        {state && "success" in state ? (
          <p role="status" className="text-xs text-emerald-700">
            {state.success}
          </p>
        ) : null}
      </div>
    </form>
  );
}
