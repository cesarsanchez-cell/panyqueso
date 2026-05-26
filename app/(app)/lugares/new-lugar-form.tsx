"use client";

import { useActionState } from "react";

import { createLugar, type CreateLugarState } from "./actions";

export function NewLugarForm() {
  const [state, formAction, pending] = useActionState<CreateLugarState, FormData>(
    createLugar,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="nombre" className="block text-sm font-medium text-neutral-800">
            Nombre del lugar
          </label>
          <input
            id="nombre"
            name="nombre"
            type="text"
            required
            maxLength={60}
            autoComplete="off"
            placeholder="Ej: Cancha Norte"
            className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          />
        </div>
        <div className="flex-1">
          <label
            htmlFor="ubicacion_maps_url"
            className="block text-sm font-medium text-neutral-800"
          >
            Ubicación en Maps <span className="font-normal text-neutral-500">(opcional)</span>
          </label>
          <input
            id="ubicacion_maps_url"
            name="ubicacion_maps_url"
            type="url"
            maxLength={2048}
            autoComplete="off"
            placeholder="https://maps.google.com/?q=…"
            className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Creando…" : "Agregar lugar"}
      </button>
      {state && "error" in state ? (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 sm:ml-3"
        >
          {state.error}
        </p>
      ) : null}
      {state && "success" in state ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 sm:ml-3"
        >
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
