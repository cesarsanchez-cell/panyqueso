"use client";

import { useActionState, useState } from "react";

import { agregarInvitado, type MutationState } from "./actions";

export function AddGuestForm({ convocatoriaId }: { convocatoriaId: string }) {
  const [state, formAction, pending] = useActionState<MutationState, FormData>(
    agregarInvitado,
    null,
  );
  const [nombre, setNombre] = useState("");

  return (
    <form
      action={(fd) => {
        formAction(fd);
        setNombre("");
      }}
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
    >
      <input type="hidden" name="convocatoria_id" value={convocatoriaId} />
      <div className="flex-1">
        <label htmlFor="nombre" className="block text-xs font-medium text-neutral-700">
          Invitado (nombre a mano)
        </label>
        <input
          id="nombre"
          name="nombre"
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Pedro (amigo de Juan)"
          className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
        />
      </div>
      <div className="sm:w-28">
        <label htmlFor="score" className="block text-xs font-medium text-neutral-700">
          Puntaje
        </label>
        <input
          id="score"
          name="score"
          type="number"
          min={1}
          max={10}
          defaultValue={6}
          className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
        />
      </div>
      <button
        type="submit"
        disabled={pending || nombre.trim().length === 0}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Agregando…" : "Agregar invitado"}
      </button>
      {state && "error" in state ? (
        <p role="alert" className="text-xs text-red-600 sm:basis-full">
          {state.error}
        </p>
      ) : null}
      {state && "success" in state ? (
        <p role="status" className="text-xs text-emerald-700 sm:basis-full">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
