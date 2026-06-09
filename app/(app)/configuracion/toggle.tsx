"use client";

import { useActionState } from "react";

import { setVeedorGate, type GateState } from "./actions";

export function VeedorGateToggle({ initial }: { initial: boolean }) {
  const [state, formAction, pending] = useActionState<GateState, FormData>(setVeedorGate, null);

  // El valor mostrado: si ya hubo un guardado exitoso usamos ese; si no, el
  // que vino del server. El botón propone el estado contrario (lo que se
  // aplicaría al tocarlo).
  const current = state && "value" in state ? state.value : initial;
  const next = !current;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-900">
            {current ? "Auditoría activada" : "Auditoría desactivada"}
          </p>
          <p className="mt-0.5 text-xs text-neutral-600">
            {current
              ? "Los cambios de ratings los propone el admin y los aprueba el veedor."
              : "El admin aplica los cambios de ratings directo, sin pasar por el veedor."}
          </p>
        </div>
        <form action={formAction} className="shrink-0">
          <input type="hidden" name="value" value={String(next)} />
          <button
            type="submit"
            disabled={pending}
            className={
              current
                ? "rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-60"
                : "rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
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
