"use client";

import { useActionState } from "react";

import { createConvocatoria, type CreateConvocatoriaState } from "../actions";

type LugarOption = { id: string; nombre: string };

type Props = {
  lugares: LugarOption[];
  defaults: {
    fecha: string;
    hora: string;
    cupo_maximo: number;
  };
};

const labelClass = "block text-sm font-medium text-neutral-800";
const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

function fieldError(state: CreateConvocatoriaState, field: string): string | null {
  if (state && "fieldErrors" in state && state.fieldErrors[field]) {
    return state.fieldErrors[field];
  }
  return null;
}

export function NewConvocatoriaForm({ lugares, defaults }: Props) {
  const [state, formAction, pending] = useActionState<CreateConvocatoriaState, FormData>(
    createConvocatoria,
    null,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="fecha" className={labelClass}>
            Fecha
          </label>
          <input
            id="fecha"
            name="fecha"
            type="date"
            defaultValue={defaults.fecha}
            required
            className={inputClass}
          />
          <ErrorLine msg={fieldError(state, "fecha")} />
        </div>
        <div>
          <label htmlFor="hora" className={labelClass}>
            Hora
          </label>
          <input
            id="hora"
            name="hora"
            type="time"
            defaultValue={defaults.hora}
            required
            className={inputClass}
          />
          <ErrorLine msg={fieldError(state, "hora")} />
        </div>
      </div>

      <div>
        <label htmlFor="lugar_id" className={labelClass}>
          Lugar
        </label>
        <select id="lugar_id" name="lugar_id" defaultValue="" className={inputClass}>
          <option value="">Sin definir</option>
          {lugares.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre}
            </option>
          ))}
        </select>
        {lugares.length === 0 ? (
          <p className="mt-1 text-xs text-neutral-500">
            No hay lugares cargados todavía. Podés crear la convocatoria sin lugar y asignarlo
            después, o cargar uno en /lugares.
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="cupo_maximo" className={labelClass}>
          Cupo máximo
        </label>
        <input
          id="cupo_maximo"
          name="cupo_maximo"
          type="number"
          min={10}
          max={24}
          defaultValue={defaults.cupo_maximo}
          required
          className={inputClass}
        />
        <p className="mt-1 text-xs text-neutral-500">Entre 10 y 24 jugadores.</p>
        <ErrorLine msg={fieldError(state, "cupo_maximo")} />
      </div>

      <div>
        <label htmlFor="notas" className={labelClass}>
          Notas (opcional)
        </label>
        <textarea
          id="notas"
          name="notas"
          rows={3}
          maxLength={500}
          className={inputClass}
          placeholder="Ej: pretemporada, traer pechera blanca…"
        />
        <ErrorLine msg={fieldError(state, "notas")} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        {state && "error" in state ? (
          <p
            role="alert"
            aria-live="polite"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creando…" : "Crear convocatoria"}
        </button>
      </div>
    </form>
  );
}

function ErrorLine({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-red-600">{msg}</p>;
}
