"use client";

import { useActionState } from "react";

import { updateGrupo, type UpdateGrupoState } from "../actions";

type Lugar = { id: string; nombre: string };

const DIAS = [
  { value: "1", label: "Lunes" },
  { value: "2", label: "Martes" },
  { value: "3", label: "Miércoles" },
  { value: "4", label: "Jueves" },
  { value: "5", label: "Viernes" },
  { value: "6", label: "Sábado" },
  { value: "0", label: "Domingo" },
] as const;

type Props = {
  grupoId: string;
  initial: {
    nombre: string;
    lugar_id: string;
    dia_semana: number;
    hora: string;
    cupo_titulares: number;
  };
  lugares: Lugar[];
};

const labelClass = "block text-sm font-medium text-neutral-800";
const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export function EditGrupoForm({ grupoId, initial, lugares }: Props) {
  const [state, formAction, pending] = useActionState<UpdateGrupoState, FormData>(
    updateGrupo,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={grupoId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="nombre" className={labelClass}>
            Nombre
          </label>
          <input
            id="nombre"
            name="nombre"
            type="text"
            required
            maxLength={80}
            defaultValue={initial.nombre}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="lugar_id" className={labelClass}>
            Lugar
          </label>
          <select
            id="lugar_id"
            name="lugar_id"
            required
            defaultValue={initial.lugar_id}
            className={inputClass}
          >
            {lugares.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="dia_semana" className={labelClass}>
            Día
          </label>
          <select
            id="dia_semana"
            name="dia_semana"
            required
            defaultValue={String(initial.dia_semana)}
            className={inputClass}
          >
            {DIAS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="hora" className={labelClass}>
            Hora
          </label>
          <input
            id="hora"
            name="hora"
            type="time"
            required
            defaultValue={initial.hora.slice(0, 5)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="cupo_titulares" className={labelClass}>
            Cupo titulares
          </label>
          <input
            id="cupo_titulares"
            name="cupo_titulares"
            type="number"
            min={6}
            max={24}
            required
            defaultValue={initial.cupo_titulares}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
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
            role="status"
            className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          >
            {state.success}
          </p>
        ) : null}
      </div>
    </form>
  );
}
