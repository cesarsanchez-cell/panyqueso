"use client";

import { useActionState } from "react";

import { coordinadorAltaJugador, type AltaCoordinadorState } from "./alta-coordinador-actions";

export type CoordinadorGrupo = { id: string; nombre: string };

/**
 * Card del coordinador para sumar un jugador a su grupo (alta group-first).
 * Form mínimo: nombre + celular + edad. Si gestiona más de un grupo, hay
 * selector; si gestiona uno solo, va por hidden input.
 */
export function AltaCoordinadorCard({ grupos }: { grupos: CoordinadorGrupo[] }) {
  const [state, formAction, pending] = useActionState<AltaCoordinadorState, FormData>(
    coordinadorAltaJugador,
    null,
  );

  if (grupos.length === 0) return null;
  const single = grupos.length === 1;

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Agregar jugador a tu grupo
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        Cargá nombre, celular y edad. Si ese celular ya juega en otro grupo, se vincula al tuyo
        (heredando su rating); si no, se crea nuevo. Después afinás su rating por grupo.
      </p>

      <form action={formAction} className="mt-4 grid gap-3 sm:grid-cols-2">
        {single ? <input type="hidden" name="grupo_id" value={grupos[0]?.id ?? ""} /> : null}

        {!single ? (
          <div className="sm:col-span-2">
            <label htmlFor="grupo_id" className="block text-xs font-medium text-neutral-700">
              Grupo
            </label>
            <select
              id="grupo_id"
              name="grupo_id"
              required
              defaultValue=""
              className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            >
              <option value="" disabled>
                Elegí un grupo…
              </option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label htmlFor="nombre" className="block text-xs font-medium text-neutral-700">
            Nombre
          </label>
          <input
            id="nombre"
            name="nombre"
            type="text"
            required
            autoComplete="off"
            placeholder="Nombre y apellido"
            className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          />
        </div>

        <div>
          <label htmlFor="celular" className="block text-xs font-medium text-neutral-700">
            Celular
          </label>
          <input
            id="celular"
            name="celular"
            type="tel"
            required
            inputMode="tel"
            autoComplete="off"
            placeholder="11 2345 6789"
            className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          />
        </div>

        <div>
          <label htmlFor="edad" className="block text-xs font-medium text-neutral-700">
            Edad
          </label>
          <input
            id="edad"
            name="edad"
            type="number"
            required
            min={14}
            max={99}
            placeholder="30"
            className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          />
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Agregando…" : "Agregar jugador"}
          </button>
        </div>
      </form>

      {state && "error" in state ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800"
        >
          {state.error}
        </p>
      ) : null}
      {state && "success" in state ? (
        <p
          role="status"
          className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800"
        >
          {state.success}
        </p>
      ) : null}
    </section>
  );
}
