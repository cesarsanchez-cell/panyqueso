"use client";

import { useActionState } from "react";

import type { Database } from "@/lib/supabase/database.types";

import { updatePlayerData, type UpdatePlayerState } from "./actions";

type PlayerRoleField = Database["public"]["Enums"]["player_role_field"];
type PositionPref = Database["public"]["Enums"]["position_pref"];
type PlayerStatus = Database["public"]["Enums"]["player_status"];
type PiernaHabil = Database["public"]["Enums"]["pierna_habil_enum"];

type Initial = {
  nombre: string;
  fecha_nacimiento: string | null;
  role_field: PlayerRoleField;
  position_pref: PositionPref;
  positions_possible: PositionPref[];
  phone: string | null;
  email: string | null;
  apodo: string | null;
  pierna_habil: PiernaHabil | null;
  status: PlayerStatus;
};

const ROLE_OPTIONS: { value: PlayerRoleField; label: string }[] = [
  { value: "arquero", label: "Arquero" },
  { value: "jugador_campo", label: "Jugador de campo" },
  { value: "mixto", label: "Mixto" },
];

const POSITION_OPTIONS: { value: PositionPref; label: string }[] = [
  { value: "arquero", label: "Arquero" },
  { value: "defensor", label: "Defensor" },
  { value: "mediocampista", label: "Mediocampista" },
  { value: "delantero", label: "Delantero" },
];

const PIERNA_OPTIONS: { value: PiernaHabil | ""; label: string }[] = [
  { value: "", label: "—" },
  { value: "derecha", label: "Derecha" },
  { value: "izquierda", label: "Izquierda" },
  { value: "ambas", label: "Ambas" },
];

const STATUS_OPTIONS: { value: PlayerStatus; label: string; desc: string }[] = [
  { value: "approved", label: "Activo", desc: "Convocable para partidos." },
  {
    value: "inactive",
    label: "Inactivo",
    desc: "No aparece en selectores ni en generador de equipos.",
  },
];

const labelClass = "block text-sm font-medium text-neutral-800";
const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

function fieldError(state: UpdatePlayerState, field: string): string | null {
  if (state && "fieldErrors" in state) return state.fieldErrors[field] ?? null;
  return null;
}

function ErrorLine({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-red-700">{msg}</p>;
}

export function AdminPlayerForm({ playerId, initial }: { playerId: string; initial: Initial }) {
  const [state, formAction, pending] = useActionState<UpdatePlayerState, FormData>(
    updatePlayerData,
    null,
  );

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Datos del jugador
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        Admin edita directo. Los ratings (técnica/físico/mental/confianza) se proponen aparte y
        pasan por veedor.
      </p>

      <form action={formAction} className="mt-4 space-y-5">
        <input type="hidden" name="player_id" value={playerId} />

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
            <ErrorLine msg={fieldError(state, "nombre")} />
          </div>
          <div>
            <label htmlFor="fecha_nacimiento" className={labelClass}>
              Fecha de nacimiento
            </label>
            <input
              id="fecha_nacimiento"
              name="fecha_nacimiento"
              type="date"
              required
              defaultValue={initial.fecha_nacimiento ?? ""}
              className={inputClass}
            />
            <ErrorLine msg={fieldError(state, "fecha_nacimiento")} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="role_field" className={labelClass}>
              Rol
            </label>
            <select
              id="role_field"
              name="role_field"
              required
              defaultValue={initial.role_field}
              className={inputClass}
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ErrorLine msg={fieldError(state, "role_field")} />
          </div>
          <div>
            <label htmlFor="position_pref" className={labelClass}>
              Posición preferida
            </label>
            <select
              id="position_pref"
              name="position_pref"
              required
              defaultValue={initial.position_pref}
              className={inputClass}
            >
              {POSITION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ErrorLine msg={fieldError(state, "position_pref")} />
          </div>
        </div>

        <fieldset>
          <legend className={labelClass}>Posiciones posibles (opcional)</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {POSITION_OPTIONS.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  name="positions_possible"
                  value={o.value}
                  defaultChecked={initial.positions_possible.includes(o.value)}
                  className="h-4 w-4 rounded border-neutral-300"
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>

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
            <ErrorLine msg={fieldError(state, "phone")} />
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
            <ErrorLine msg={fieldError(state, "email")} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
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
            <ErrorLine msg={fieldError(state, "apodo")} />
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
              {PIERNA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ErrorLine msg={fieldError(state, "pierna_habil")} />
          </div>
        </div>

        <div>
          <label htmlFor="status" className={labelClass}>
            Estado
          </label>
          <select
            id="status"
            name="status"
            required
            defaultValue={initial.status === "pending" ? "approved" : initial.status}
            className={inputClass}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-neutral-500">
            {STATUS_OPTIONS.find(
              (o) => o.value === (initial.status === "pending" ? "approved" : initial.status),
            )?.desc ?? ""}
          </p>
          <ErrorLine msg={fieldError(state, "status")} />
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
