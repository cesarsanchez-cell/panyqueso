"use client";

import { useActionState } from "react";

import {
  assignCoordinador,
  unassignCoordinador,
  type CoordinadorState,
} from "./coordinadores-actions";
import { InvitarGestionForm } from "./invitar-gestion-form";
import { invitarCoordinadorNuevo } from "./invitar-gestion-actions";

export type AssignedCoordinador = {
  id: string; // id de la fila coordinador_grupos
  profileId: string;
  nombre: string;
  email: string | null;
};

export type EligibleCoordinador = {
  profileId: string;
  nombre: string;
};

/**
 * Card admin para gestionar qué coordinadores manejan este grupo. Los profiles
 * elegibles son los que ya tienen rol 'coordinador' (se setea en Supabase) y no
 * están asignados todavía a este grupo.
 */
export function CoordinadoresSection({
  grupoId,
  grupoNombre,
  assigned,
  eligible,
}: {
  grupoId: string;
  grupoNombre: string;
  assigned: AssignedCoordinador[];
  eligible: EligibleCoordinador[];
}) {
  const [state, formAction, pending] = useActionState<CoordinadorState, FormData>(
    assignCoordinador,
    null,
  );

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Coordinadores
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        Un coordinador gestiona este grupo con las mismas funciones que vos, pero acotado a él.
        Elegí a un miembro del grupo y, al asignarlo, le das el rango de coordinador.
      </p>

      {assigned.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
          Este grupo no tiene coordinadores asignados.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-100">
          {assigned.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-sm text-neutral-900">
                {c.nombre}
                {c.email ? (
                  <span className="ml-2 text-xs font-normal text-neutral-400">{c.email}</span>
                ) : null}
              </span>
              <form action={unassignCoordinador}>
                <input type="hidden" name="coordinador_grupo_id" value={c.id} />
                <input type="hidden" name="grupo_id" value={grupoId} />
                <button
                  type="submit"
                  className="rounded border border-red-200 bg-white px-2 py-0.5 text-xs font-medium text-red-700 transition hover:bg-red-50"
                  title="Quitar como coordinador de este grupo"
                >
                  Quitar
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-neutral-100 pt-4">
        {eligible.length === 0 ? (
          <p className="text-xs text-neutral-500">
            No hay miembros disponibles para asignar. La persona tiene que ser{" "}
            <span className="font-medium">miembro del grupo</span> y tener cuenta en la app.
          </p>
        ) : (
          <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="grupo_id" value={grupoId} />
            <div className="min-w-0 flex-1">
              <label htmlFor="profile_id" className="block text-xs font-medium text-neutral-700">
                Agregar coordinador
              </label>
              <select
                id="profile_id"
                name="profile_id"
                required
                defaultValue=""
                className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              >
                <option value="" disabled>
                  Elegí un coordinador…
                </option>
                {eligible.map((e) => (
                  <option key={e.profileId} value={e.profileId}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Asignando…" : "Asignar"}
            </button>
          </form>
        )}

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
      </div>

      <InvitarGestionForm
        rol="coordinador"
        grupoId={grupoId}
        grupoNombre={grupoNombre}
        action={invitarCoordinadorNuevo}
      />
    </section>
  );
}
