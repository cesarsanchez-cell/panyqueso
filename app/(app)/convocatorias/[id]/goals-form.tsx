"use client";

import { useActionState, useMemo, useState } from "react";

import { saveMatchPlayerGoals, type SaveGoalsState } from "./goals-actions";

export type GoalsFormPlayer = {
  playerId: string;
  nombre: string;
  isGoalkeeper: boolean;
};

export type GoalsFormTeam = {
  label: string;
  score: number | null;
  players: GoalsFormPlayer[];
};

type Props = {
  convocatoriaId: string;
  teams: GoalsFormTeam[];
  initialGoalsByPlayerId: Record<string, number>;
};

const labelClass = "block text-xs font-medium text-neutral-700";
const inputClass =
  "mt-1 block w-20 rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export function GoalsForm({ convocatoriaId, teams, initialGoalsByPlayerId }: Props) {
  const [state, formAction, pending] = useActionState<SaveGoalsState, FormData>(
    saveMatchPlayerGoals,
    null,
  );

  const initial = useMemo<Record<string, string>>(() => {
    const obj: Record<string, string> = {};
    for (const t of teams) {
      for (const p of t.players) {
        obj[p.playerId] = String(initialGoalsByPlayerId[p.playerId] ?? 0);
      }
    }
    return obj;
  }, [teams, initialGoalsByPlayerId]);

  const [goals, setGoals] = useState<Record<string, string>>(initial);

  function handleChange(playerId: string, value: string) {
    setGoals((prev) => ({ ...prev, [playerId]: value }));
  }

  function teamSum(team: GoalsFormTeam): number {
    let sum = 0;
    for (const p of team.players) {
      const raw = goals[p.playerId] ?? "0";
      const n = Number(raw);
      if (Number.isInteger(n) && n >= 0) sum += n;
    }
    return sum;
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="convocatoria_id" value={convocatoriaId} />

      <div className="grid gap-4 sm:grid-cols-2">
        {teams.map((team) => {
          const sum = teamSum(team);
          const mismatch = team.score !== null && sum !== team.score;
          return (
            <div
              key={team.label}
              className="rounded-md border border-neutral-200 bg-neutral-50 p-4"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-sm font-semibold text-neutral-900">Team {team.label}</h4>
                <p
                  className={`text-xs ${mismatch ? "text-amber-700" : "text-neutral-500"}`}
                  aria-live="polite"
                >
                  Goles: {sum}
                  {team.score !== null ? ` / ${team.score}` : ""}
                </p>
              </div>

              {mismatch ? (
                <p className="mt-2 text-xs text-amber-700">
                  La suma de goles no coincide con el resultado ({team.score}).
                </p>
              ) : null}

              <ul className="mt-3 space-y-2">
                {team.players.map((p) => (
                  <li key={p.playerId} className="flex items-center justify-between gap-2">
                    <label htmlFor={`goals-${p.playerId}`} className={labelClass}>
                      <span className="flex items-center gap-1.5">
                        {p.isGoalkeeper ? (
                          <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
                            GK
                          </span>
                        ) : null}
                        <span className="truncate text-neutral-900">{p.nombre}</span>
                      </span>
                    </label>
                    <input
                      id={`goals-${p.playerId}`}
                      name={`goals_${p.playerId}`}
                      type="number"
                      min={0}
                      max={99}
                      step={1}
                      value={goals[p.playerId] ?? "0"}
                      onChange={(e) => handleChange(p.playerId, e.target.value)}
                      className={inputClass}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar goles"}
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
