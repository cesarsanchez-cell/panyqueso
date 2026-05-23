/**
 * Fase 6 PR 1: generador de teams determinístico.
 *
 * Algoritmo:
 *   1. Asigna arqueros: prioridad role_field='arquero' por internal_score
 *      desc; si falta uno, completa con el mejor 'mixto'. Si quedan teams
 *      sin GK, warning.
 *   2. Para los demás: greedy por internal_score desc, cada jugador va al
 *      team con score total más bajo (tie-break: menor cantidad).
 *
 * Determinístico: mismo input -> mismo output. El orden estable se logra
 * sorteando por (internal_score desc, id asc) — id evita variabilidad
 * cuando hay empates.
 *
 * No persiste nada. La transición a `cerrada` + INSERT de matches/
 * match_teams/match_team_players queda para PR 3 (Confirmar match).
 */

import type { Database } from "@/lib/supabase/database.types";

type RoleField = Database["public"]["Enums"]["player_role_field"];
type PositionPref = Database["public"]["Enums"]["position_pref"];

export type GeneratorInput = {
  id: string;
  nombre: string;
  role_field: RoleField;
  position_pref: PositionPref;
  internal_score: number;
};

export type TeamLabel = "A" | "B";

export type TeamComposition = {
  goalkeeper: GeneratorInput | null;
  players: GeneratorInput[]; // jugadores de campo (sin contar GK)
  totalScore: number;
};

export type BalanceSummary = {
  teamA: TeamComposition;
  teamB: TeamComposition;
  totalDiff: number;
  positionDist: {
    A: Record<PositionPref, number>;
    B: Record<PositionPref, number>;
  };
  warnings: string[];
};

function emptyComposition(): TeamComposition {
  return { goalkeeper: null, players: [], totalScore: 0 };
}

function emptyPositionDist(): Record<PositionPref, number> {
  return { defensor: 0, mediocampista: 0, delantero: 0 };
}

function teamCount(t: TeamComposition): number {
  return t.players.length + (t.goalkeeper ? 1 : 0);
}

function sortByScoreDesc(arr: GeneratorInput[]): GeneratorInput[] {
  return [...arr].sort((a, b) => {
    if (b.internal_score !== a.internal_score) return b.internal_score - a.internal_score;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Asigna 2 arqueros (uno por team) priorizando role_field='arquero' y luego
 * 'mixto'. Devuelve los GKs y los players que quedan disponibles para
 * distribución por campo.
 */
function pickGoalkeepers(input: GeneratorInput[]): {
  gkA: GeneratorInput | null;
  gkB: GeneratorInput | null;
  remaining: GeneratorInput[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const sorted = sortByScoreDesc(input);

  const arqueros = sorted.filter((p) => p.role_field === "arquero");
  const mixtos = sorted.filter((p) => p.role_field === "mixto");

  let gkA: GeneratorInput | null = null;
  let gkB: GeneratorInput | null = null;

  if (arqueros.length >= 2) {
    gkA = arqueros[0] ?? null;
    gkB = arqueros[1] ?? null;
  } else if (arqueros.length === 1) {
    gkA = arqueros[0] ?? null;
    if (mixtos.length >= 1) {
      gkB = mixtos[0] ?? null;
      warnings.push("Team B sin arquero puro: se usa al mejor mixto como GK.");
    } else {
      warnings.push("Team B sin arquero. Asigná uno manualmente antes de confirmar.");
    }
  } else {
    // 0 arqueros.
    if (mixtos.length >= 2) {
      gkA = mixtos[0] ?? null;
      gkB = mixtos[1] ?? null;
      warnings.push("Ningún arquero puro: ambos GKs son mixtos.");
    } else if (mixtos.length === 1) {
      gkA = mixtos[0] ?? null;
      warnings.push("Solo 1 mixto disponible para GK. Team B sin arquero.");
    } else {
      warnings.push("Ningún arquero ni mixto. Ambos teams sin GK.");
    }
  }

  const usedIds = new Set<string>();
  if (gkA) usedIds.add(gkA.id);
  if (gkB) usedIds.add(gkB.id);
  const remaining = sorted.filter((p) => !usedIds.has(p.id));

  return { gkA, gkB, remaining, warnings };
}

export function generateTeams(input: GeneratorInput[]): BalanceSummary {
  const teamA = emptyComposition();
  const teamB = emptyComposition();

  const { gkA, gkB, remaining, warnings } = pickGoalkeepers(input);

  teamA.goalkeeper = gkA;
  if (gkA) teamA.totalScore += gkA.internal_score;
  teamB.goalkeeper = gkB;
  if (gkB) teamB.totalScore += gkB.internal_score;

  // Greedy: cada jugador va al team con menor score total (tie-break:
  // menor cantidad). remaining ya viene ordenado desc por sortByScoreDesc.
  for (const p of remaining) {
    const goesToA =
      teamA.totalScore < teamB.totalScore ||
      (teamA.totalScore === teamB.totalScore && teamCount(teamA) <= teamCount(teamB));

    if (goesToA) {
      teamA.players.push(p);
      teamA.totalScore += p.internal_score;
    } else {
      teamB.players.push(p);
      teamB.totalScore += p.internal_score;
    }
  }

  const positionDist = {
    A: emptyPositionDist(),
    B: emptyPositionDist(),
  };
  for (const p of teamA.players) positionDist.A[p.position_pref]++;
  for (const p of teamB.players) positionDist.B[p.position_pref]++;

  const totalDiff = Math.abs(teamA.totalScore - teamB.totalScore);

  // Warnings adicionales sobre el balance final.
  if (totalDiff > 2) {
    warnings.push(`Diferencia de score elevada (${totalDiff.toFixed(2)}).`);
  }
  if (Math.abs(teamCount(teamA) - teamCount(teamB)) > 1) {
    warnings.push("Los teams quedaron desbalanceados en cantidad.");
  }

  return { teamA, teamB, totalDiff, positionDist, warnings };
}
