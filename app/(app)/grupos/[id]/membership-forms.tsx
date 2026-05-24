"use client";

import { useActionState } from "react";

import {
  addMember,
  demoteToSuplente,
  promoteToTitular,
  removeMember,
  type MembershipState,
} from "../actions";

// ----------------------------------------------------------------------------
// AddMemberForm: agregar un player como titular o suplente al grupo.
// ----------------------------------------------------------------------------
type AvailablePlayer = { id: string; nombre: string };

export function AddMemberForm({
  grupoId,
  availablePlayers,
  hayCupoTitular,
}: {
  grupoId: string;
  availablePlayers: AvailablePlayer[];
  hayCupoTitular: boolean;
}) {
  const [state, formAction, pending] = useActionState<MembershipState, FormData>(addMember, null);

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <input type="hidden" name="grupo_id" value={grupoId} />

      <div className="min-w-0 flex-1">
        <label htmlFor="player_id" className="block text-xs font-medium text-neutral-700">
          Jugador
        </label>
        <select
          id="player_id"
          name="player_id"
          required
          defaultValue=""
          className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
        >
          <option value="" disabled>
            Elegí…
          </option>
          {availablePlayers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="tipo" className="block text-xs font-medium text-neutral-700">
          Tipo
        </label>
        <select
          id="tipo"
          name="tipo"
          defaultValue={hayCupoTitular ? "titular" : "suplente"}
          className="mt-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
        >
          <option value="titular">Titular</option>
          <option value="suplente">Suplente</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={pending || availablePlayers.length === 0}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Agregando…" : "Agregar"}
      </button>

      {state && "error" in state ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

// ----------------------------------------------------------------------------
// Acciones por membresia (botones simples q invocan server actions).
// ----------------------------------------------------------------------------
const btnNeutral =
  "rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60";
const btnDanger =
  "rounded border border-red-200 bg-white px-2 py-0.5 text-xs font-medium text-red-700 transition hover:bg-red-50";

export function PromoteForm({ membresiaId }: { membresiaId: string }) {
  return (
    <form action={promoteToTitular}>
      <input type="hidden" name="membresia_id" value={membresiaId} />
      <button type="submit" className={btnNeutral} title="Subir a titular">
        ↑ Titular
      </button>
    </form>
  );
}

export function DemoteForm({ membresiaId }: { membresiaId: string }) {
  return (
    <form action={demoteToSuplente}>
      <input type="hidden" name="membresia_id" value={membresiaId} />
      <button type="submit" className={btnNeutral} title="Bajar a suplente (al final de la cola)">
        ↓ Suplente
      </button>
    </form>
  );
}

export function RemoveMemberForm({ membresiaId }: { membresiaId: string }) {
  return (
    <form action={removeMember}>
      <input type="hidden" name="membresia_id" value={membresiaId} />
      <button type="submit" className={btnDanger} title="Sacar del grupo">
        Sacar
      </button>
    </form>
  );
}
