"use client";

import { useActionState, useMemo, useRef, useState } from "react";

import {
  addMember,
  demoteToSuplente,
  promoteToTitular,
  removeMember,
  type MembershipState,
} from "../actions";

// ----------------------------------------------------------------------------
// AddMemberForm: agregar un player como titular o suplente al grupo.
// Combobox custom: input + dropdown con todos los matches por nombre/apodo.
// ----------------------------------------------------------------------------
type AvailablePlayer = { id: string; nombre: string };

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function AddMemberForm({
  grupoId,
  availablePlayers,
}: {
  grupoId: string;
  availablePlayers: AvailablePlayer[];
}) {
  const [state, formAction, pending] = useActionState<MembershipState, FormData>(addMember, null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AvailablePlayer | null>(null);
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cuando el query no matchea exacto al label del seleccionado, descartamos
  // la seleccion. Asi evitamos mandar un player_id viejo despues de retipear.
  const effectiveSelectedId = useMemo(() => {
    if (!selected) return "";
    if (selected.nombre === query) return selected.id;
    return "";
  }, [selected, query]);

  const matches = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return availablePlayers.slice(0, 50);
    return availablePlayers.filter((p) => normalize(p.nombre).includes(q)).slice(0, 50);
  }, [availablePlayers, query]);

  const hasMatch = effectiveSelectedId !== "";

  function handleSelect(p: AvailablePlayer) {
    setQuery(p.nombre);
    setSelected(p);
    setOpen(false);
  }

  function handleBlur() {
    // delay para que un click en una opcion no cierre el dropdown antes de
    // disparar handleSelect.
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => setOpen(false), 120);
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <input type="hidden" name="grupo_id" value={grupoId} />
      <input type="hidden" name="player_id" value={effectiveSelectedId} />

      <div className="relative min-w-0 flex-1">
        <label htmlFor="player_query" className="block text-xs font-medium text-neutral-700">
          Jugador
        </label>
        <input
          id="player_query"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          required
          placeholder="Empezá a tipear nombre o apodo…"
          autoComplete="off"
          className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
        />
        {open && matches.length > 0 ? (
          <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-neutral-300 bg-white shadow-lg">
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    // mousedown corre antes que blur del input
                    e.preventDefault();
                    handleSelect(p);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-neutral-900 transition hover:bg-neutral-100"
                >
                  {p.nombre}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {query && !hasMatch && !open ? (
          <p className="mt-1 text-xs text-amber-700">Elegí un jugador de la lista.</p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending || availablePlayers.length === 0 || !hasMatch}
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
      {state && "success" in state ? (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800"
        >
          {state.success}
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
