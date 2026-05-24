"use client";

import Link from "next/link";
import { useActionState } from "react";

import { createGrupo, type CreateGrupoState } from "./actions";

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

const labelClass = "block text-sm font-medium text-neutral-800";
const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export function NewGrupoForm({ lugares }: { lugares: Lugar[] }) {
  const [state, formAction, pending] = useActionState<CreateGrupoState, FormData>(
    createGrupo,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="nombre" className={labelClass}>
            Nombre del grupo
          </label>
          <input
            id="nombre"
            name="nombre"
            type="text"
            required
            maxLength={80}
            placeholder="Ej: Martes 20hs Cancha del Tano"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="lugar_id" className={labelClass}>
            Lugar
          </label>
          <select id="lugar_id" name="lugar_id" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Elegí…
            </option>
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
            defaultValue="2"
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
            defaultValue="20:00"
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
            defaultValue={12}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || lugares.length === 0}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creando…" : "Crear grupo"}
        </button>
        {lugares.length === 0 ? (
          <p className="text-xs text-amber-700">
            Antes cargá al menos un lugar en{" "}
            <Link href="/lugares" className="underline">
              /lugares
            </Link>
            .
          </p>
        ) : null}
        {state && "error" in state ? (
          <p
            role="alert"
            aria-live="polite"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {state.error}
          </p>
        ) : null}
        {state && "success" in state ? (
          <p
            role="status"
            aria-live="polite"
            className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          >
            {state.success}
          </p>
        ) : null}
      </div>
    </form>
  );
}
