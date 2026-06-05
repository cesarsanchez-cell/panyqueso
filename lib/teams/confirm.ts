import type { Json } from "@/lib/supabase/database.types";

import type { TeamDraft } from "./draft";

/**
 * Lógica pura de validación/snapshot usada por la server action `confirmMatch`
 * (app/(app)/convocatorias/[id]/confirm-actions.ts). Vive acá, separada del
 * "use server", para poder testearla sin DB (pnpm test:unit).
 */

export const ALGORITHM_VERSION = "v1.0";
export const MIN_PLAYERS_PER_TEAM = 5;

export type PlayerCore = {
  id: string;
  nombre: string;
  role_field: "arquero" | "jugador_campo" | "mixto";
  position_pref: "arquero" | "defensor" | "mediocampista" | "delantero";
  internal_score: number;
};

export function sumScores(
  ids: string[],
  gk: string | null,
  byId: Map<string, PlayerCore>,
): { total: number; missing: string[] } {
  let total = 0;
  const missing: string[] = [];
  const all = gk ? [gk, ...ids] : ids;
  for (const id of all) {
    const p = byId.get(id);
    if (!p) {
      missing.push(id);
      continue;
    }
    total += p.internal_score;
  }
  return { total, missing };
}

export function positionDist(ids: string[], byId: Map<string, PlayerCore>) {
  const dist = { arquero: 0, defensor: 0, mediocampista: 0, delantero: 0 };
  for (const id of ids) {
    const p = byId.get(id);
    if (p) dist[p.position_pref]++;
  }
  return dist;
}

export function buildBalanceSnapshot(
  draft: TeamDraft,
  byId: Map<string, PlayerCore>,
  warnings: string[],
  confirmedWithWarning: boolean,
): Json {
  const sideJson = (s: TeamDraft["A"]) => {
    const gk = s.goalkeeperPlayerId ? (byId.get(s.goalkeeperPlayerId) ?? null) : null;
    const players = s.playerIds
      .map((id) => byId.get(id))
      .filter((p): p is PlayerCore => Boolean(p))
      .map((p) => ({
        id: p.id,
        nombre: p.nombre,
        internal_score: p.internal_score,
        position_pref: p.position_pref,
        role_field: p.role_field,
      }));

    const { total } = sumScores(s.playerIds, s.goalkeeperPlayerId, byId);

    return {
      goalkeeper: gk
        ? {
            id: gk.id,
            nombre: gk.nombre,
            internal_score: gk.internal_score,
            role_field: gk.role_field,
          }
        : null,
      players,
      total_score: total,
      position_distribution: positionDist(s.playerIds, byId),
    };
  };

  return {
    algorithm_version: ALGORITHM_VERSION,
    confirmed_with_warning: confirmedWithWarning,
    warnings,
    teams: {
      A: sideJson(draft.A),
      B: sideJson(draft.B),
    },
  } as Json;
}

export function checkWarnings(
  draft: TeamDraft,
  byId: Map<string, PlayerCore>,
): { warnings: string[]; blockingErrors: string[] } {
  const warnings: string[] = [];
  const blockingErrors: string[] = [];

  const countA = draft.A.playerIds.length + (draft.A.goalkeeperPlayerId ? 1 : 0);
  const countB = draft.B.playerIds.length + (draft.B.goalkeeperPlayerId ? 1 : 0);

  if (countA < MIN_PLAYERS_PER_TEAM) {
    blockingErrors.push(`Team A tiene solo ${countA} jugador(es); mínimo ${MIN_PLAYERS_PER_TEAM}.`);
  }
  if (countB < MIN_PLAYERS_PER_TEAM) {
    blockingErrors.push(`Team B tiene solo ${countB} jugador(es); mínimo ${MIN_PLAYERS_PER_TEAM}.`);
  }

  if (!draft.A.goalkeeperPlayerId) warnings.push("Team A sin arquero asignado.");
  if (!draft.B.goalkeeperPlayerId) warnings.push("Team B sin arquero asignado.");

  const { total: scoreA, missing: missingA } = sumScores(
    draft.A.playerIds,
    draft.A.goalkeeperPlayerId,
    byId,
  );
  const { total: scoreB, missing: missingB } = sumScores(
    draft.B.playerIds,
    draft.B.goalkeeperPlayerId,
    byId,
  );

  if (missingA.length > 0 || missingB.length > 0) {
    blockingErrors.push(
      "Hay jugadores en el draft que ya no son titulares (alguien se bajó o cambió la cola). Regenerá el draft.",
    );
  }

  const diff = Math.abs(scoreA - scoreB);
  if (diff > 2) {
    warnings.push(`Diferencia de score elevada (${diff.toFixed(2)}).`);
  }

  if (Math.abs(countA - countB) > 1) {
    warnings.push(`Diferencia de cantidad entre teams (${Math.abs(countA - countB)}).`);
  }

  return { warnings, blockingErrors };
}
