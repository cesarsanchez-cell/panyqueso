"use client";

import { useActionState } from "react";

import { assignVeedor, unassignVeedor, type VeedorGrupoState } from "./veedores-actions";

export type AssignedVeedor = {
  id: string; // id de la fila veedor_grupos
  profileId: string;
  nombre: string;
};

export type EligibleVeedor = {
  profileId: string;
  nombre: string;
};

/**
 * Card para gestionar los veedores de este grupo (admin o coordinador). Un
 * veedor revisa los cambios de rating del grupo antes de aplicarse. Si el grupo
 * no tiene veedor, los cambios se aplican directo. Es opcional y por grupo.
 */
export function VeedoresSection({
  grupoId,
  assigned,
  eligible,
}: {
  grupoId: string;
  assigned: AssignedVeedor[];
  eligible: EligibleVeedor[];
}) {
  const [state, formAction, pending] = useActionState<VeedorGrupoState, FormData>(
    assignVeedor,
    null,
  );

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Veedores</h2>
      <p className="mt-1 text-xs text-neutral-500">
        El veedor revisa los cambios de rating de este grupo antes de que se apliquen. Es opcional:
        si el grupo no tiene veedor, los cambios se aplican directo. Elegí a un miembro y, al
        asignarlo, le das el rango de veedor.
      </p>

      {assigned.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
          Este grupo no tiene veedores: los cambios de rating se aplican directo.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-100">
          {assigned.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-sm text-neutral-900">{v.nombre}</span>
              <form action={unassignVeedor}>
                <input type="hidden" name="veedor_grupo_id" value={v.id} />
                <input type="hidden" name="grupo_id" value={grupoId} />
                <button
                  type="submit"
                  className="rounded border border-red-200 bg-white px-2 py-0.5 text-xs font-medium text-red-700 transition hover:bg-red-50"
                  title="Quitar como veedor de este grupo"
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
              <label
                htmlFor="veedor_profile_id"
                className="block text-xs font-medium text-neutral-700"
              >
                Agregar veedor
              </label>
              <select
                id="veedor_profile_id"
                name="profile_id"
                required
                defaultValue=""
                className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              >
                <option value="" disabled>
                  Elegí un veedor…
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
    </section>
  );
}
