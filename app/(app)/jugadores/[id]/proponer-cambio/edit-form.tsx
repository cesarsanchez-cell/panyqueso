"use client";

import { useActionState, useState } from "react";

import type { Database } from "@/lib/supabase/database.types";

import { proposeChange, type ProposeChangeState } from "./actions";

type RatingConfidence = Database["public"]["Enums"]["rating_confidence"];

type SubKey =
  | "phys_power"
  | "phys_speed"
  | "phys_stamina"
  | "ment_tactical"
  | "ment_resilience"
  | "ment_attitude"
  | "tech_passing"
  | "tech_finishing"
  | "tech_linkup";

type Initial = {
  id: string;
  rating_confidence: RatingConfidence;
} & Record<SubKey, number>;

const DIMENSIONS: { label: string; subs: { name: SubKey; label: string }[] }[] = [
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
];

const CONFIDENCE_OPTIONS = [
  { value: "baja", label: "Baja" },
  { value: "media", label: "Media" },
  { value: "alta", label: "Alta" },
] as const;

const labelClass = "block text-sm font-medium text-neutral-800";
const inputClass =
  "block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

function fieldError(state: ProposeChangeState, field: string): string | null {
  if (state && "fieldErrors" in state && state.fieldErrors[field]) {
    return state.fieldErrors[field];
  }
  return null;
}

export function EditForm({ initial }: { initial: Initial }) {
  const bound = proposeChange.bind(null, initial.id);
  const [state, formAction, pending] = useActionState<ProposeChangeState, FormData>(bound, null);

  const [values, setValues] = useState<Record<SubKey, number>>(() => ({
    phys_power: initial.phys_power,
    phys_speed: initial.phys_speed,
    phys_stamina: initial.phys_stamina,
    ment_tactical: initial.ment_tactical,
    ment_resilience: initial.ment_resilience,
    ment_attitude: initial.ment_attitude,
    tech_passing: initial.tech_passing,
    tech_finishing: initial.tech_finishing,
    tech_linkup: initial.tech_linkup,
  }));

  function setSub(name: SubKey, raw: string) {
    const n = Number(raw);
    setValues((v) => ({ ...v, [name]: Number.isFinite(n) ? n : 0 }));
  }

  return (
    <form action={formAction} className="space-y-6">
      <Section title="Sub-ratings (1–10)">
        <p className="text-xs text-neutral-500">
          Cada dimensión es el promedio de sus 3 subcomponentes. Este cambio pasa por el veedor
          antes de aplicarse. El resto de los datos del jugador (nombre, posición, contacto, etc.)
          los editás directo desde la pantalla de detalle.
        </p>

        <div className="mt-4 space-y-5">
          {DIMENSIONS.map((dim) => {
            const avg = (
              dim.subs.reduce((acc, s) => acc + (values[s.name] || 0), 0) / dim.subs.length
            ).toFixed(1);
            return (
              <div key={dim.label} className="rounded-md border border-neutral-200 p-4">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold text-neutral-900">{dim.label}</h3>
                  <span className="text-xs text-neutral-500">
                    Promedio: <span className="font-semibold text-neutral-800">{avg}</span>
                  </span>
                </div>
                <div className="mt-3 grid gap-4 sm:grid-cols-3">
                  {dim.subs.map((s) => (
                    <div key={s.name}>
                      <label htmlFor={s.name} className={labelClass}>
                        {s.label}
                      </label>
                      <input
                        id={s.name}
                        name={s.name}
                        type="number"
                        min={1}
                        max={10}
                        required
                        value={values[s.name]}
                        onChange={(e) => setSub(s.name, e.target.value)}
                        className={inputClass}
                      />
                      <ErrorLine msg={fieldError(state, s.name)} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4">
          <label htmlFor="rating_confidence" className={labelClass}>
            Confianza
          </label>
          <select
            id="rating_confidence"
            name="rating_confidence"
            defaultValue={initial.rating_confidence}
            required
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

      <Section title="Motivo del cambio">
        <textarea
          id="reason"
          name="reason"
          rows={2}
          required
          className={inputClass}
          placeholder="Ej: subió notablemente el físico tras la pretemporada."
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
          {pending ? "Enviando…" : "Proponer ratings"}
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
  return <p className="mt-1 text-xs text-red-600">{msg}</p>;
}
