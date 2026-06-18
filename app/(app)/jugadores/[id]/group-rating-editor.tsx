"use client";

import { useActionState } from "react";

import type { Database } from "@/lib/supabase/database.types";

import { proposeGroupRating, type GroupRatingState } from "./group-rating-actions";

type RoleField = Database["public"]["Enums"]["player_role_field"];
type PositionPref = Database["public"]["Enums"]["position_pref"];
type RatingConfidence = Database["public"]["Enums"]["rating_confidence"];
type Liderazgo = Database["public"]["Enums"]["liderazgo_nivel"];

export type GroupRatingInitial = {
  phys_power: number;
  phys_speed: number;
  phys_stamina: number;
  ment_tactical: number;
  ment_resilience: number;
  ment_attitude: number;
  tech_passing: number;
  tech_finishing: number;
  tech_linkup: number;
  role_field: RoleField;
  position_pref: PositionPref;
  rating_confidence: RatingConfidence;
  liderazgo: Liderazgo;
  internal_score: number;
};

const ROLE_OPTIONS: { value: RoleField; label: string }[] = [
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

const CONFIDENCE_OPTIONS: { value: RatingConfidence; label: string }[] = [
  { value: "inicial", label: "Inicial (sin evaluar)" },
  { value: "baja", label: "Baja" },
  { value: "media", label: "Media" },
  { value: "alta", label: "Alta" },
];

const LIDERAZGO_OPTIONS: { value: Liderazgo; label: string }[] = [
  { value: "negativo", label: "Negativo (quejoso)" },
  { value: "ninguno", label: "Ninguno" },
  { value: "positivo", label: "Positivo (líder)" },
];

const GROUPS: { titulo: string; subs: { key: keyof GroupRatingInitial; label: string }[] }[] = [
  {
    titulo: "Físico",
    subs: [
      { key: "phys_power", label: "Potencia" },
      { key: "phys_speed", label: "Velocidad" },
      { key: "phys_stamina", label: "Resistencia" },
    ],
  },
  {
    titulo: "Mental",
    subs: [
      { key: "ment_tactical", label: "Táctico" },
      { key: "ment_resilience", label: "Resiliencia" },
      { key: "ment_attitude", label: "Actitud" },
    ],
  },
  {
    titulo: "Técnica",
    subs: [
      { key: "tech_passing", label: "Pase" },
      { key: "tech_finishing", label: "Definición" },
      { key: "tech_linkup", label: "Asociación" },
    ],
  },
];

const inputClass =
  "mt-1 w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export function GroupRatingEditor({
  playerId,
  grupoId,
  grupoNombre,
  veedorActivo,
  initial,
}: {
  playerId: string;
  grupoId: string;
  grupoNombre: string;
  veedorActivo: boolean;
  initial: GroupRatingInitial;
}) {
  const [state, formAction, pending] = useActionState<GroupRatingState, FormData>(
    proposeGroupRating,
    null,
  );

  return (
    <form
      action={formAction}
      className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
    >
      <input type="hidden" name="player_id" value={playerId} />
      <input type="hidden" name="grupo_id" value={grupoId} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-neutral-900">{grupoNombre}</h3>
        <span className="text-xs text-neutral-500">
          Score actual:{" "}
          <span className="font-semibold">{Number(initial.internal_score).toFixed(2)}</span>
        </span>
      </div>
      <p className="mt-0.5 text-xs text-neutral-500">
        {veedorActivo
          ? "Este grupo audita: el cambio queda pendiente del veedor."
          : "Este grupo no audita: el cambio se aplica al instante."}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {GROUPS.map((g) => (
          <fieldset key={g.titulo} className="rounded-md border border-neutral-200 p-2">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {g.titulo}
            </legend>
            <div className="space-y-1.5">
              {g.subs.map((s) => (
                <label key={s.key} className="block text-xs text-neutral-600">
                  {s.label}
                  <input
                    type="number"
                    name={s.key}
                    min={1}
                    max={10}
                    step={1}
                    defaultValue={initial[s.key] as number}
                    required
                    className={inputClass}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-neutral-600">
          Rol en este grupo
          <select name="role_field" defaultValue={initial.role_field} className={inputClass}>
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-neutral-600">
          Posición preferida
          <select name="position_pref" defaultValue={initial.position_pref} className={inputClass}>
            {POSITION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-neutral-600">
          Confianza del rating
          <select
            name="rating_confidence"
            defaultValue={initial.rating_confidence}
            className={inputClass}
          >
            {CONFIDENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-neutral-600">
          Liderazgo en el grupo
          <select name="liderazgo" defaultValue={initial.liderazgo} className={inputClass}>
            {LIDERAZGO_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-2 text-xs text-neutral-500">
        El <strong>liderazgo</strong> no cambia el score del jugador: ajusta el balance del equipo.
        Un <strong>positivo</strong> organiza y mejora al resto (potencia); un{" "}
        <strong>negativo</strong> (quejoso) molesta a sus compañeros (penaliza). Los coeficientes
        los fija el admin en Configuración.
      </p>

      <label className="mt-3 block text-xs text-neutral-600">
        Motivo del cambio
        <input
          type="text"
          name="reason"
          required
          placeholder="Ej: rinde distinto en este grupo"
          className={inputClass}
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Guardando…" : veedorActivo ? "Enviar al veedor" : "Guardar rating"}
        </button>
        {state && "error" in state ? (
          <p role="alert" className="text-xs text-red-700">
            {state.error}
          </p>
        ) : null}
        {state && "success" in state ? (
          <p
            role="status"
            className={`text-xs ${state.pending ? "text-amber-700" : "text-emerald-700"}`}
          >
            {state.success}
          </p>
        ) : null}
      </div>
    </form>
  );
}
