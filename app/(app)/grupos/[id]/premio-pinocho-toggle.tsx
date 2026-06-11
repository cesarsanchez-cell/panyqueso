"use client";

import { useActionState } from "react";

import { setPremioPinocho, type PremioPinochoState } from "./premio-pinocho-actions";

// Toggle opt-in del premio 🪵 Pinocho (peor jugador) para un grupo. Mismo patrón
// que el toggle del veedor: el botón propone el estado contrario.
export function PremioPinochoToggle({ grupoId, initial }: { grupoId: string; initial: boolean }) {
  const [state, formAction, pending] = useActionState<PremioPinochoState, FormData>(
    setPremioPinocho,
    null,
  );

  const current = state && "value" in state ? state.value : initial;
  const next = !current;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-900">
            🪵 Premio Pinocho {current ? "activado" : "desactivado"}
          </p>
          <p className="mt-0.5 text-xs text-neutral-600">
            {current
              ? "Los que jugaron pueden votar al peor del partido (al lado de la figura)."
              : "El peor jugador no se vota en este grupo. Activalo solo si al grupo le gusta la cargada."}
          </p>
        </div>
        <form action={formAction} className="shrink-0">
          <input type="hidden" name="grupo_id" value={grupoId} />
          <input type="hidden" name="value" value={String(next)} />
          <button
            type="submit"
            disabled={pending}
            className={
              current
                ? "rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-60"
                : "rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-amber-800 disabled:opacity-60"
            }
          >
            {pending ? "Guardando…" : current ? "Desactivar" : "Activar"}
          </button>
        </form>
      </div>

      {state && "error" in state ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.error}
        </p>
      ) : null}
      {state && "success" in state ? (
        <p
          aria-live="polite"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          {state.success}
        </p>
      ) : null}
    </div>
  );
}
