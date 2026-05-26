"use client";

import { useActionState, useMemo, useState } from "react";

import { createConvocatoriaFromGrupo, type CreateFromGrupoState } from "../actions";

type GrupoOption = {
  id: string;
  nombre: string;
  dia_semana: number;
  hora: string;
  cupo_titulares: number;
  fecha_sugerida: string;
  lugar: { id: string; nombre: string; maps: string | null } | null;
};

const DIA_LABEL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const labelClass = "block text-sm font-medium text-neutral-800";
const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export function NewConvocatoriaForm({
  grupos,
  grupoPreseleccionado,
}: {
  grupos: GrupoOption[];
  grupoPreseleccionado: string;
}) {
  const [grupoId, setGrupoId] = useState(grupoPreseleccionado);
  const grupo = useMemo(() => grupos.find((g) => g.id === grupoId), [grupos, grupoId]);
  const [fecha, setFecha] = useState(grupo?.fecha_sugerida ?? "");

  const [state, formAction, pending] = useActionState<CreateFromGrupoState, FormData>(
    createConvocatoriaFromGrupo,
    null,
  );

  // Cuando el admin cambia de grupo, sugerimos la nueva fecha.
  function onGrupoChange(id: string) {
    setGrupoId(id);
    const g = grupos.find((x) => x.id === id);
    if (g) setFecha(g.fecha_sugerida);
  }

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="grupo_id" className={labelClass}>
          Grupo
        </label>
        <select
          id="grupo_id"
          name="grupo_id"
          value={grupoId}
          onChange={(e) => onGrupoChange(e.target.value)}
          className={inputClass}
        >
          {grupos.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nombre}
            </option>
          ))}
        </select>
      </div>

      {grupo ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
          <p>
            Día habitual del grupo: <strong>{DIA_LABEL[grupo.dia_semana]}</strong>
          </p>
          <p>
            Hora: <strong>{grupo.hora.slice(0, 5)}</strong>
          </p>
          <p>
            Lugar: <strong>{grupo.lugar?.nombre ?? "Sin lugar definido"}</strong>
            {grupo.lugar?.maps ? (
              <>
                {" "}
                ·{" "}
                <a
                  href={grupo.lugar.maps}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Ver en Maps ↗
                </a>
              </>
            ) : null}
          </p>
          <p>
            Cupo titulares: <strong>{grupo.cupo_titulares}</strong>
          </p>
        </div>
      ) : null}

      <div>
        <label htmlFor="fecha" className={labelClass}>
          Fecha del partido
        </label>
        <input
          id="fecha"
          name="fecha"
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          required
          className={inputClass}
        />
        <p className="mt-1 text-xs text-neutral-500">
          Sugerido: la próxima ocurrencia del día habitual del grupo. Podés cambiarlo.
        </p>
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
          disabled={pending || !grupoId}
          className="rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creando…" : "Crear convocatoria"}
        </button>
      </div>
    </form>
  );
}
