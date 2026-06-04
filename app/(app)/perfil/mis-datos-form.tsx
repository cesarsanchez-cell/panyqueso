"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { ClubSelect } from "@/components/club-select";
import { formatArLocal } from "@/lib/phone";
import type { Database } from "@/lib/supabase/database.types";

import { updateMyPlayerData, type MisDatosState } from "./actions";

type PlayerRoleField = Database["public"]["Enums"]["player_role_field"];
type PositionPref = Database["public"]["Enums"]["position_pref"];
type PiernaHabil = Database["public"]["Enums"]["pierna_habil_enum"];

export type MisDatosInitial = {
  nombre: string;
  apodo: string | null;
  fecha_nacimiento: string | null;
  email: string | null;
  phone: string | null;
  pierna_habil: PiernaHabil | null;
  role_field: PlayerRoleField;
  position_pref: PositionPref;
  positions_possible: PositionPref[];
  ubicacion_maps_url: string | null;
  club_id: string | null;
};

const ROLES: { value: PlayerRoleField; label: string }[] = [
  { value: "arquero", label: "Arquero" },
  { value: "jugador_campo", label: "Jugador de campo" },
  { value: "mixto", label: "Mixto" },
];

const POSITIONS: { value: PositionPref; label: string }[] = [
  { value: "arquero", label: "Arquero" },
  { value: "defensor", label: "Defensor" },
  { value: "mediocampista", label: "Mediocampista" },
  { value: "delantero", label: "Delantero" },
];

const PIERNAS: { value: PiernaHabil; label: string }[] = [
  { value: "derecha", label: "Derecha" },
  { value: "izquierda", label: "Izquierda" },
  { value: "ambas", label: "Ambas" },
];

export function MisDatosForm({ initial }: { initial: MisDatosInitial }) {
  const [state, formAction, pending] = useActionState<MisDatosState, FormData>(
    updateMyPlayerData,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [positions, setPositions] = useState<Set<PositionPref>>(
    () => new Set(initial.positions_possible),
  );

  useEffect(() => {
    if (state && "success" in state) {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [state]);

  const fieldErrors = state && "fieldErrors" in state ? state.fieldErrors : {};
  const successMsg = state && "success" in state ? state.success : null;
  const errorMsg = state && "error" in state ? state.error : null;

  function togglePosition(p: PositionPref) {
    setPositions((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <Field label="Nombre y apellido" htmlFor="nombre" error={fieldErrors.nombre}>
        <input
          id="nombre"
          name="nombre"
          type="text"
          required
          maxLength={80}
          defaultValue={initial.nombre}
          className={inputClass(fieldErrors.nombre)}
        />
      </Field>

      <Field label="Apodo (opcional)" htmlFor="apodo" error={fieldErrors.apodo}>
        <input
          id="apodo"
          name="apodo"
          type="text"
          maxLength={40}
          defaultValue={initial.apodo ?? ""}
          className={inputClass(fieldErrors.apodo)}
        />
      </Field>

      <Field
        label="Fecha de nacimiento"
        htmlFor="fecha_nacimiento"
        error={fieldErrors.fecha_nacimiento}
      >
        <input
          id="fecha_nacimiento"
          name="fecha_nacimiento"
          type="date"
          required
          defaultValue={initial.fecha_nacimiento ?? ""}
          className={inputClass(fieldErrors.fecha_nacimiento)}
        />
      </Field>

      <Field label="Email (opcional)" htmlFor="email" error={fieldErrors.email}>
        <input
          id="email"
          name="email"
          type="email"
          maxLength={254}
          defaultValue={initial.email ?? ""}
          className={inputClass(fieldErrors.email)}
        />
        <p className="text-xs text-neutral-500">
          Lo usamos solo como contacto / recuperación. No se usa para iniciar sesión.
        </p>
      </Field>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-neutral-800">Celular</label>
        <input
          type="text"
          value={initial.phone ? formatArLocal(initial.phone) : "—"}
          disabled
          className="block w-full cursor-not-allowed rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-base text-neutral-500"
        />
        <p className="text-xs text-neutral-500">
          El celular es tu clave de ingreso. Si cambió, pedile al admin que lo actualice.
        </p>
      </div>

      <Field label="Pierna hábil" htmlFor="pierna_habil" error={fieldErrors.pierna_habil}>
        <select
          id="pierna_habil"
          name="pierna_habil"
          defaultValue={initial.pierna_habil ?? ""}
          className={inputClass(fieldErrors.pierna_habil)}
        >
          <option value="">—</option>
          {PIERNAS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Rol en cancha" htmlFor="role_field" error={fieldErrors.role_field}>
        <select
          id="role_field"
          name="role_field"
          required
          defaultValue={initial.role_field}
          className={inputClass(fieldErrors.role_field)}
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Posición preferida" htmlFor="position_pref" error={fieldErrors.position_pref}>
        <select
          id="position_pref"
          name="position_pref"
          required
          defaultValue={initial.position_pref}
          className={inputClass(fieldErrors.position_pref)}
        >
          {POSITIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="space-y-2">
        <legend className="block text-sm font-medium text-neutral-800">
          Posiciones que también podés jugar
        </legend>
        <div className="flex flex-wrap gap-2">
          {POSITIONS.map((p) => {
            const checked = positions.has(p.value);
            return (
              <label
                key={p.value}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
                  checked
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                <input
                  type="checkbox"
                  name="positions_possible"
                  value={p.value}
                  checked={checked}
                  onChange={() => togglePosition(p.value)}
                  className="sr-only"
                />
                {p.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <Field
        label="Equipo del que sos hincha (opcional)"
        htmlFor="club_id"
        error={fieldErrors.club_id}
      >
        <ClubSelect defaultValue={initial.club_id} className={inputClass(fieldErrors.club_id)} />
      </Field>

      <Field
        label="Link de Google Maps a tu zona (opcional)"
        htmlFor="ubicacion_maps_url"
        error={fieldErrors.ubicacion_maps_url}
      >
        <input
          id="ubicacion_maps_url"
          name="ubicacion_maps_url"
          type="url"
          maxLength={500}
          placeholder="https://maps.app.goo.gl/..."
          defaultValue={initial.ubicacion_maps_url ?? ""}
          className={inputClass(fieldErrors.ubicacion_maps_url)}
        />
      </Field>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>

      {successMsg ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
        >
          {successMsg}
        </p>
      ) : null}

      {errorMsg ? (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {errorMsg}
        </p>
      ) : null}
    </form>
  );
}

function inputClass(hasError?: string): string {
  const base =
    "block w-full rounded-md border bg-white px-3 py-2 text-base shadow-sm focus:outline-none focus:ring-1";
  return hasError
    ? `${base} border-red-300 focus:border-red-500 focus:ring-red-500`
    : `${base} border-neutral-300 focus:border-neutral-900 focus:ring-neutral-900`;
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-neutral-800">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
