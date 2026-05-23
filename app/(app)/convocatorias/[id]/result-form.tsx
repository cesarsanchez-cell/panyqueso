"use client";

import { useActionState } from "react";

import { saveMatchResult, type SaveResultState } from "./result-actions";

type Props = {
  convocatoriaId: string;
  initialScoreA: number | null;
  initialScoreB: number | null;
  initialNotas: string | null;
  hasResult: boolean;
};

const labelClass = "block text-sm font-medium text-neutral-800";
const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export function ResultForm({
  convocatoriaId,
  initialScoreA,
  initialScoreB,
  initialNotas,
  hasResult,
}: Props) {
  const [state, formAction, pending] = useActionState<SaveResultState, FormData>(
    saveMatchResult,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="convocatoria_id" value={convocatoriaId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="score_team_a" className={labelClass}>
            Goles Team A
          </label>
          <input
            id="score_team_a"
            name="score_team_a"
            type="number"
            min={0}
            max={99}
            defaultValue={initialScoreA ?? ""}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="score_team_b" className={labelClass}>
            Goles Team B
          </label>
          <input
            id="score_team_b"
            name="score_team_b"
            type="number"
            min={0}
            max={99}
            defaultValue={initialScoreB ?? ""}
            required
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="notas" className={labelClass}>
          Notas (opcional)
        </label>
        <textarea
          id="notas"
          name="notas"
          rows={2}
          maxLength={500}
          defaultValue={initialNotas ?? ""}
          className={inputClass}
          placeholder="Ej: jugamos con lluvia. Lesión de X al minuto 30."
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Guardando…" : hasResult ? "Actualizar resultado" : "Guardar resultado"}
        </button>
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
      </div>
    </form>
  );
}
