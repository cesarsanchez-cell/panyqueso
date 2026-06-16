"use client";

import { useActionState } from "react";

import { setVeedor, type VeedorState } from "./actions";

export type VeedorCandidate = {
  profileId: string;
  nombre: string;
  phone: string | null;
  esVeedor: boolean;
};

/**
 * Lista de jugadores con cuenta + un switch "Es veedor" por cada uno. El veedor
 * es global (audita ratings en todo). No aparecen acá admin ni coordinadores
 * (tienen otro rango).
 */
export function VeedoresList({ candidates }: { candidates: VeedorCandidate[] }) {
  const [state, formAction] = useActionState<VeedorState, FormData>(setVeedor, null);

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No hay jugadores con cuenta para asignar. La persona tiene que tener cuenta en la app.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {state && "error" in state ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800"
        >
          {state.error}
        </p>
      ) : null}
      {state && "success" in state ? (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800"
        >
          {state.success}
        </p>
      ) : null}

      <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
        {candidates.map((c) => (
          <li key={c.profileId} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-neutral-900">{c.nombre}</p>
              {c.phone ? <p className="truncate text-xs text-neutral-500">{c.phone}</p> : null}
            </div>
            <form action={formAction} className="shrink-0">
              <input type="hidden" name="profile_id" value={c.profileId} />
              <input type="hidden" name="value" value={c.esVeedor ? "false" : "true"} />
              <button
                type="submit"
                role="switch"
                aria-checked={c.esVeedor}
                aria-label={`${c.esVeedor ? "Quitar" : "Otorgar"} rango de veedor a ${c.nombre}`}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                  c.esVeedor ? "bg-neutral-900" : "bg-neutral-300"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                    c.esVeedor ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
