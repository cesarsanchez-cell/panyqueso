"use client";

import { useActionState, useMemo, useState } from "react";

import { playerLabel } from "@/lib/players/label";

import { saveMatchPlayerGoals, type SaveGoalsState } from "./goals-actions";

export type GoalsFormPlayer = {
  playerId: string;
  nombre: string;
  apodo: string | null;
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
  initialAssistsByPlayerId: Record<string, number>;
  initialOwnGoalsByPlayerId: Record<string, number>;
};

const inputClass =
  "mt-1 block w-16 rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export function GoalsForm({
  convocatoriaId,
  teams,
  initialGoalsByPlayerId,
  initialAssistsByPlayerId,
  initialOwnGoalsByPlayerId,
}: Props) {
  const [state, formAction, pending] = useActionState<SaveGoalsState, FormData>(
    saveMatchPlayerGoals,
    null,
  );

  const initialGoals = useMemo<Record<string, string>>(() => {
    const obj: Record<string, string> = {};
    for (const t of teams) {
      for (const p of t.players) {
        obj[p.playerId] = String(initialGoalsByPlayerId[p.playerId] ?? 0);
      }
    }
    return obj;
  }, [teams, initialGoalsByPlayerId]);

  const initialAssists = useMemo<Record<string, string>>(() => {
    const obj: Record<string, string> = {};
    for (const t of teams) {
      for (const p of t.players) {
        obj[p.playerId] = String(initialAssistsByPlayerId[p.playerId] ?? 0);
      }
    }
    return obj;
  }, [teams, initialAssistsByPlayerId]);

  const initialOwnGoals = useMemo<Record<string, string>>(() => {
    const obj: Record<string, string> = {};
    for (const t of teams) {
      for (const p of t.players) {
        obj[p.playerId] = String(initialOwnGoalsByPlayerId[p.playerId] ?? 0);
      }
    }
    return obj;
  }, [teams, initialOwnGoalsByPlayerId]);

  const [goals, setGoals] = useState<Record<string, string>>(initialGoals);
  const [assists, setAssists] = useState<Record<string, string>>(initialAssists);
  const [ownGoals, setOwnGoals] = useState<Record<string, string>>(initialOwnGoals);

  function intOf(map: Record<string, string>, playerId: string): number {
    const n = Number(map[playerId] ?? "0");
    return Number.isInteger(n) && n >= 0 ? n : 0;
  }

  // Marcador efectivo de un equipo = goles a favor de sus jugadores + goles en
  // contra (autogoles) de los jugadores del rival (esos suman para este equipo).
  function teamSum(team: GoalsFormTeam): number {
    const goalsFor = team.players.reduce((acc, p) => acc + intOf(goals, p.playerId), 0);
    const rival = teams.find((t) => t.label !== team.label);
    const rivalOwnGoals = (rival?.players ?? []).reduce(
      (acc, p) => acc + intOf(ownGoals, p.playerId),
      0,
    );
    return goalsFor + rivalOwnGoals;
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

              <div className="mt-3 grid grid-cols-[1fr_auto_auto_auto] items-end gap-x-3 gap-y-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                  Jugador
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                  Goles
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                  Asist.
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                  En contra
                </span>

                {team.players.map((p) => (
                  <div key={p.playerId} className="contents">
                    <span className="flex min-w-0 items-center gap-1.5 self-center">
                      {p.isGoalkeeper ? (
                        <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
                          GK
                        </span>
                      ) : null}
                      <span className="truncate text-sm text-neutral-900">
                        {playerLabel(p.nombre, p.apodo)}
                      </span>
                    </span>
                    <input
                      aria-label={`Goles de ${playerLabel(p.nombre, p.apodo)}`}
                      name={`goals_${p.playerId}`}
                      type="number"
                      min={0}
                      max={99}
                      step={1}
                      value={goals[p.playerId] ?? "0"}
                      onChange={(e) =>
                        setGoals((prev) => ({ ...prev, [p.playerId]: e.target.value }))
                      }
                      className={inputClass}
                    />
                    <input
                      aria-label={`Asistencias de ${playerLabel(p.nombre, p.apodo)}`}
                      name={`asist_${p.playerId}`}
                      type="number"
                      min={0}
                      max={99}
                      step={1}
                      value={assists[p.playerId] ?? "0"}
                      onChange={(e) =>
                        setAssists((prev) => ({ ...prev, [p.playerId]: e.target.value }))
                      }
                      className={inputClass}
                    />
                    <input
                      aria-label={`Goles en contra de ${playerLabel(p.nombre, p.apodo)}`}
                      name={`contra_${p.playerId}`}
                      type="number"
                      min={0}
                      max={99}
                      step={1}
                      value={ownGoals[p.playerId] ?? "0"}
                      onChange={(e) =>
                        setOwnGoals((prev) => ({ ...prev, [p.playerId]: e.target.value }))
                      }
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>
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
          {pending ? "Guardando…" : "Guardar estadísticas"}
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
