"use client";

import { useActionState } from "react";

import { setCupo, type MutationState } from "./actions";

// Editor del cupo de titulares de una convocatoria abierta. Al guardar, la RPC
// reacomoda el roster (sube suplentes o baja titulares a la cola). Solo se monta
// para admin + convocatoria abierta.
export function CupoEditor({
  convocatoriaId,
  cupoActual,
}: {
  convocatoriaId: string;
  cupoActual: number;
}) {
  const [state, formAction, pending] = useActionState<MutationState, FormData>(setCupo, null);

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Cantidad de titulares
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        El ideal viene del grupo, pero podés ajustarlo para este partido. Al cambiarlo, los lugares
        se reacomodan: si subís, entran los de la lista de espera; si bajás, los últimos titulares
        pasan al frente de la lista.
      </p>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-3">
        <input type="hidden" name="convocatoria_id" value={convocatoriaId} />
        <div>
          <label htmlFor="cupo" className="block text-xs font-medium text-neutral-700">
            Titulares
          </label>
          <input
            id="cupo"
            name="cupo"
            type="number"
            min={6}
            max={24}
            required
            defaultValue={cupoActual}
            className="mt-1 w-24 rounded-md border border-neutral-300 bg-white px-3 py-2 text-base shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </form>

      {state && "error" in state ? (
        <p
          role="alert"
          aria-live="polite"
          className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.error}
        </p>
      ) : null}
      {state && "success" in state ? (
        <p
          role="status"
          className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          {state.success}
        </p>
      ) : null}
    </section>
  );
}
