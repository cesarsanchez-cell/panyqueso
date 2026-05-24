"use client";

import { useActionState } from "react";

import type { Database } from "@/lib/supabase/database.types";

import { proposeChange, type ProposeChangeState } from "./actions";

type PlayerRoleField = Database["public"]["Enums"]["player_role_field"];
type PositionPref = Database["public"]["Enums"]["position_pref"];
type RatingConfidence = Database["public"]["Enums"]["rating_confidence"];

type Initial = {
  id: string;
  edad: number;
  role_field: PlayerRoleField;
  position_pref: PositionPref;
  technical: number;
  physical: number;
  mental: number;
  rating_confidence: RatingConfidence;
};

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

  return (
    <form action={formAction} className="space-y-6">
      <Section title="Posición">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="role_field" className={labelClass}>
              Rol en cancha
            </label>
            <select
              id="role_field"
              name="role_field"
              defaultValue={initial.role_field}
              required
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
              defaultValue={initial.position_pref}
              required
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
      </Section>

      <Section title="Datos">
        <div>
          <label htmlFor="edad" className={labelClass}>
            Edad
          </label>
          <input
            id="edad"
            name="edad"
            type="number"
            min={14}
            max={99}
            defaultValue={initial.edad}
            required
            className={inputClass}
          />
          <ErrorLine msg={fieldError(state, "edad")} />
        </div>
      </Section>

      <Section title="Ratings (1–10)">
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              { name: "technical", label: "Técnica", value: initial.technical },
              { name: "physical", label: "Físico", value: initial.physical },
              { name: "mental", label: "Mental", value: initial.mental },
            ] as const
          ).map((f) => (
            <div key={f.name}>
              <label htmlFor={f.name} className={labelClass}>
                {f.label}
              </label>
              <input
                id={f.name}
                name={f.name}
                type="number"
                min={1}
                max={10}
                defaultValue={f.value}
                required
                className={inputClass}
              />
              <ErrorLine msg={fieldError(state, f.name)} />
            </div>
          ))}
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
          {pending ? "Enviando…" : "Proponer cambio"}
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
