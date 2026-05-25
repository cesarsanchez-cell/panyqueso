"use client";

import { useActionState } from "react";

import type { Database } from "@/lib/supabase/database.types";

import { updateContactFields, type ContactFieldsState } from "./actions";

type PiernaHabil = Database["public"]["Enums"]["pierna_habil_enum"];

type Initial = {
  phone: string | null;
  email: string | null;
  apodo: string | null;
  pierna_habil: PiernaHabil | null;
  fecha_nacimiento: string | null;
};

const labelClass = "block text-sm font-medium text-neutral-800";
const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

const PIERNA_OPTIONS: { value: PiernaHabil | ""; label: string }[] = [
  { value: "", label: "—" },
  { value: "derecha", label: "Derecha" },
  { value: "izquierda", label: "Izquierda" },
  { value: "ambas", label: "Ambas" },
];

export function ContactFieldsForm({ playerId, initial }: { playerId: string; initial: Initial }) {
  const [state, formAction, pending] = useActionState<ContactFieldsState, FormData>(
    updateContactFields,
    null,
  );

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Contacto y datos personales
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        Visible para admin y veedor. Edita libremente: no pasa por aprobación. El teléfono se usa
        como identidad del jugador para futuras invitaciones.
      </p>

      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="player_id" value={playerId} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="phone" className={labelClass}>
              Teléfono (WhatsApp)
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={initial.phone ?? ""}
              placeholder="+5491155551234"
              className={`${inputClass} font-mono`}
            />
            <p className="mt-1 text-xs text-neutral-500">Formato E.164. Dejá vacío para limpiar.</p>
          </div>
          <div>
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={initial.email ?? ""}
              placeholder="juan@ejemplo.com"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-neutral-500">Opcional. Solo lo ven admin y veedor.</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="apodo" className={labelClass}>
              Apodo
            </label>
            <input
              id="apodo"
              name="apodo"
              type="text"
              maxLength={40}
              defaultValue={initial.apodo ?? ""}
              placeholder="Tano"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="pierna_habil" className={labelClass}>
              Pierna hábil
            </label>
            <select
              id="pierna_habil"
              name="pierna_habil"
              defaultValue={initial.pierna_habil ?? ""}
              className={inputClass}
            >
              {PIERNA_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="fecha_nacimiento" className={labelClass}>
              Fecha de nacimiento
            </label>
            <input
              id="fecha_nacimiento"
              name="fecha_nacimiento"
              type="date"
              defaultValue={initial.fecha_nacimiento ?? ""}
              className={inputClass}
            />
          </div>
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
          {state && "success" in state ? (
            <p
              role="status"
              aria-live="polite"
              className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
            >
              {state.success}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </section>
  );
}
