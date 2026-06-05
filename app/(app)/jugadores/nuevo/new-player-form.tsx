"use client";

import { useActionState } from "react";

import { BirthdateInput } from "@/components/birthdate-input";

import { createPlayerRequest, type NewPlayerState } from "./actions";

const ROLE_OPTIONS = [
  { value: "arquero", label: "Arquero" },
  { value: "jugador_campo", label: "Jugador de campo" },
  { value: "mixto", label: "Mixto" },
] as const;

const POSITION_OPTIONS = [
  { value: "arquero", label: "Arquero" },
  { value: "defensor", label: "Defensor" },
  { value: "mediocampista", label: "Mediocampista" },
  { value: "delantero", label: "Delantero" },
] as const;

const CONFIDENCE_OPTIONS = [
  { value: "baja", label: "Baja" },
  { value: "media", label: "Media" },
  { value: "alta", label: "Alta" },
] as const;

// Modelo de puntuación v2: 9 subcomponentes agrupados por dimensión. La
// dimensión técnica/físico/mental se calcula como el promedio de sus 3 subs.
const DIMENSIONS = [
  {
    label: "Físico",
    subs: [
      { name: "phys_power", label: "Potencia / fuerza" },
      { name: "phys_speed", label: "Velocidad" },
      { name: "phys_stamina", label: "Resistencia" },
    ],
  },
  {
    label: "Mental",
    subs: [
      { name: "ment_tactical", label: "Orden táctico" },
      { name: "ment_resilience", label: "Resiliencia" },
      { name: "ment_attitude", label: "Actitud" },
    ],
  },
  {
    label: "Técnica",
    subs: [
      { name: "tech_passing", label: "Pase" },
      { name: "tech_finishing", label: "Eficacia" },
      { name: "tech_linkup", label: "Asociación" },
    ],
  },
] as const;

function fieldError(state: NewPlayerState, field: string): string | null {
  if (state && "fieldErrors" in state && state.fieldErrors[field]) {
    return state.fieldErrors[field];
  }
  return null;
}

const labelClass = "block text-sm font-medium text-neutral-800";
const inputClass =
  "block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";
const errorClass = "mt-1 text-xs text-red-600";

export function NewPlayerForm() {
  const [state, formAction, pending] = useActionState<NewPlayerState, FormData>(
    createPlayerRequest,
    null,
  );

  return (
    <form action={formAction} className="space-y-6">
      <Section title="Identidad">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="nombre" className={labelClass}>
              Nombre
            </label>
            <input id="nombre" name="nombre" type="text" required className={inputClass} />
            <ErrorLine msg={fieldError(state, "nombre")} />
          </div>
          <div>
            <label htmlFor="fecha_nacimiento" className={labelClass}>
              Fecha de nacimiento
            </label>
            <BirthdateInput id="fecha_nacimiento" required className={inputClass} />
            <ErrorLine msg={fieldError(state, "fecha_nacimiento")} />
          </div>
        </div>
      </Section>

      <Section title="Posición">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="role_field" className={labelClass}>
              Rol en cancha
            </label>
            <select id="role_field" name="role_field" required className={inputClass}>
              <option value="">Elegí…</option>
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
            <select id="position_pref" name="position_pref" required className={inputClass}>
              <option value="">Elegí…</option>
              {POSITION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ErrorLine msg={fieldError(state, "position_pref")} />
          </div>
        </div>
        <fieldset className="mt-4">
          <legend className={labelClass}>Posiciones posibles (opcional)</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {POSITION_OPTIONS.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  name="positions_possible"
                  value={o.value}
                  className="h-4 w-4 rounded border-neutral-300"
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      </Section>

      <Section title="Ratings (1–10)">
        <p className="text-xs text-neutral-500">
          Cargá los 9 subcomponentes. Cada dimensión (Físico / Mental / Técnica) se calcula como el
          promedio de sus 3.
        </p>
        <div className="mt-3 space-y-4">
          {DIMENSIONS.map((dim) => (
            <fieldset key={dim.label}>
              <legend className={labelClass}>{dim.label}</legend>
              <div className="mt-2 grid gap-4 sm:grid-cols-3">
                {dim.subs.map((s) => (
                  <div key={s.name}>
                    <label htmlFor={s.name} className="block text-xs font-medium text-neutral-600">
                      {s.label}
                    </label>
                    <input
                      id={s.name}
                      name={s.name}
                      type="number"
                      min={1}
                      max={10}
                      required
                      className={inputClass}
                    />
                    <ErrorLine msg={fieldError(state, s.name)} />
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <div className="mt-4">
          <label htmlFor="rating_confidence" className={labelClass}>
            Confianza en los ratings
          </label>
          <select
            id="rating_confidence"
            name="rating_confidence"
            defaultValue="baja"
            className={inputClass}
          >
            {CONFIDENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ErrorLine msg={fieldError(state, "rating_confidence")} />
        </div>
      </Section>

      <Section title="Notas privadas (opcional)">
        <textarea
          id="private_notes"
          name="private_notes"
          rows={3}
          className={inputClass}
          placeholder="Información solo visible para admin y veedor."
        />
      </Section>

      <Section title="Motivo de la solicitud">
        <textarea
          id="reason"
          name="reason"
          rows={2}
          required
          className={inputClass}
          placeholder="Ej: nuevo jugador para la próxima fecha."
        />
        <ErrorLine msg={fieldError(state, "reason")} />
      </Section>

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
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Enviando…" : "Crear solicitud"}
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ErrorLine({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className={errorClass}>{msg}</p>;
}
