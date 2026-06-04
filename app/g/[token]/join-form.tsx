"use client";

import { useActionState } from "react";

import { joinGroup, type JoinGroupState } from "./actions";

const labelClass = "block text-sm font-medium text-neutral-800";
const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

const ROLE_OPTIONS = [
  { value: "arquero", label: "Arquero" },
  { value: "jugador_campo", label: "Jugador de campo" },
  { value: "mixto", label: "Mixto" },
];

const POSITION_OPTIONS = [
  { value: "arquero", label: "Arquero" },
  { value: "defensor", label: "Defensor" },
  { value: "mediocampista", label: "Mediocampista" },
  { value: "delantero", label: "Delantero" },
];

const PIERNA_OPTIONS = [
  { value: "", label: "Prefiero no decir" },
  { value: "derecha", label: "Derecha" },
  { value: "izquierda", label: "Izquierda" },
  { value: "ambas", label: "Ambas" },
];

function fieldError(state: JoinGroupState, field: string): string | null {
  if (state && "fieldErrors" in state) return state.fieldErrors[field] ?? null;
  return null;
}

function ErrorLine({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-red-700">{msg}</p>;
}

export function JoinForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<JoinGroupState, FormData>(joinGroup, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <div>
        <label htmlFor="phone" className={labelClass}>
          Celular
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          required
          placeholder="1155551234"
          className={`${inputClass} font-mono`}
        />
        <p className="mt-1 text-xs text-neutral-500">
          10 dígitos (sin 0 ni 15). Es el número con el que vas a entrar a la app.
        </p>
        <ErrorLine msg={fieldError(state, "phone")} />
      </div>

      <div>
        <label htmlFor="nombre" className={labelClass}>
          Nombre completo
        </label>
        <input
          id="nombre"
          name="nombre"
          type="text"
          required
          maxLength={80}
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
          className={inputClass}
        />
        <ErrorLine msg={fieldError(state, "fecha_nacimiento")} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="role_field" className={labelClass}>
            Rol
          </label>
          <select id="role_field" name="role_field" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Elegí…
            </option>
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
            defaultValue=""
            className={inputClass}
          >
            <option value="" disabled>
              Elegí…
            </option>
            {POSITION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ErrorLine msg={fieldError(state, "position_pref")} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className={labelClass}>
            Email <span className="text-neutral-500">(opcional)</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            maxLength={254}
            autoComplete="email"
            placeholder="vos@ejemplo.com"
            className={inputClass}
          />
          <ErrorLine msg={fieldError(state, "email")} />
        </div>
        <div>
          <label htmlFor="pierna_habil" className={labelClass}>
            Pierna hábil <span className="text-neutral-500">(opcional)</span>
          </label>
          <select id="pierna_habil" name="pierna_habil" defaultValue="" className={inputClass}>
            {PIERNA_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ErrorLine msg={fieldError(state, "pierna_habil")} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="password" className={labelClass}>
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
          <ErrorLine msg={fieldError(state, "password")} />
        </div>
        <div>
          <label htmlFor="password_confirm" className={labelClass}>
            Repetir contraseña
          </label>
          <input
            id="password_confirm"
            name="password_confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
          <ErrorLine msg={fieldError(state, "password_confirm")} />
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        Mínimo 8 caracteres. Guardala bien — la usás cada vez que entres a la app.
      </p>

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
        disabled={pending}
        className="w-full rounded-md bg-neutral-900 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Creando tu cuenta…" : "Crear cuenta y unirme al grupo"}
      </button>
    </form>
  );
}
