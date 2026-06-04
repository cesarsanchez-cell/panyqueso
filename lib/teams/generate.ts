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
  // FUT-87: metadata de variedad vs la fecha anterior. Solo presente cuando se
  // generó con generateTeamsWithVariety.
  variety?: VarietyResult;
};

// Composición del partido anterior del grupo: ids de jugadores por equipo.
// Los labels A/B son arbitrarios entre fechas (no representan "el mismo
// equipo"); el conteo de cambios alinea la orientación, ver countRegroup().
export type PreviousComposition = {
  teamA: string[];
  teamB: string[];
};

export type VarietyOptions = {
  previous?: PreviousComposition | null;
  // Tolerancia de desbalance, en % del score promedio por equipo. Default 5.
  tolerancePct?: number;
  // Mínimo de jugadores que deben quedar en distinto grupo que la fecha
  // anterior. Default 2.
  minChanges?: number;
};

export type VarietyResult = {
  // Jugadores que cambiaron de grupo respecto de la fecha anterior (alineando
  // la orientación de los labels para medir reagrupamiento real).
  changes: number;
  // Jugadores presentes en ambas fechas (los únicos que pueden "cambiar").
  returningPlayers: number;
  // true si se eligió un split distinto del baseline para forzar variedad.
  applied: boolean;
  // true si el resultado cumple minChanges dentro de la tolerancia.
  satisfied: boolean;
};

function emptyComposition(): TeamComposition {
  return { goalkeeper: null, players: [], totalScore: 0 };
}

function emptyPositionDist(): Record<PositionPref, number> {
  return { arquero: 0, defensor: 0, mediocampista: 0, delantero: 0 };
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

/**
 * Split balanceado base (greedy determinístico). No arma el BalanceSummary:
 * devuelve las composiciones + los warnings de arquero, para poder reusarse
 * tanto en generateTeams como en el picker de variedad (FUT-87).
 */
function generateBaseline(input: GeneratorInput[]): {
  teamA: TeamComposition;
  teamB: TeamComposition;
  gkWarnings: string[];
} {
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

  return { teamA, teamB, gkWarnings: warnings };
}

function compTotal(gk: GeneratorInput | null, players: GeneratorInput[]): number {
  return (gk?.internal_score ?? 0) + players.reduce((acc, p) => acc + p.internal_score, 0);
}

/** Arma el BalanceSummary final a partir de dos composiciones ya definidas. */
function assembleSummary(
  teamA: TeamComposition,
  teamB: TeamComposition,
  gkWarnings: string[],
): BalanceSummary {
  const positionDist = {
    A: emptyPositionDist(),
    B: emptyPositionDist(),
  };
  for (const p of teamA.players) positionDist.A[p.position_pref]++;
  for (const p of teamB.players) positionDist.B[p.position_pref]++;

  const totalDiff = Math.abs(teamA.totalScore - teamB.totalScore);

  const warnings = [...gkWarnings];
  if (totalDiff > 2) {
    warnings.push(`Diferencia de score elevada (${totalDiff.toFixed(2)}).`);
  }
  if (Math.abs(teamCount(teamA) - teamCount(teamB)) > 1) {
    warnings.push("Los teams quedaron desbalanceados en cantidad.");
  }

  return { teamA, teamB, totalDiff, positionDist, warnings };
}

export function generateTeams(input: GeneratorInput[]): BalanceSummary {
  const { teamA, teamB, gkWarnings } = generateBaseline(input);
  return assembleSummary(teamA, teamB, gkWarnings);
}

// Ids de todos los jugadores de una composición (incluido el arquero).
function compIds(comp: TeamComposition): string[] {
  return comp.goalkeeper
    ? [comp.goalkeeper.id, ...comp.players.map((p) => p.id)]
    : comp.players.map((p) => p.id);
}

/**
 * Cuenta cuántos jugadores quedaron en distinto grupo que la fecha anterior.
 * Los labels A/B son arbitrarios entre fechas, así que probamos las dos
 * orientaciones (identidad y espejada) y tomamos el mínimo: ese es el
 * reagrupamiento real. Solo cuentan los jugadores presentes en ambas fechas.
 */
function countRegroup(
  aIds: string[],
  bIds: string[],
  prev: PreviousComposition,
): { changes: number; returningPlayers: number } {
  const prevTeamOf = new Map<string, "A" | "B">();
  for (const id of prev.teamA) prevTeamOf.set(id, "A");
  for (const id of prev.teamB) prevTeamOf.set(id, "B");

  let returning = 0;
  let sameLabel = 0;
  for (const id of aIds) {
    const p = prevTeamOf.get(id);
    if (!p) continue;
    returning++;
    if (p === "A") sameLabel++;
  }
  for (const id of bIds) {
    const p = prevTeamOf.get(id);
    if (!p) continue;
    returning++;
    if (p === "B") sameLabel++;
  }
  // Bajo orientación identidad cambiaron (returning - sameLabel); bajo la
  // espejada cambiaron sameLabel. El reagrupamiento real es el mínimo.
  const changes = Math.min(returning - sameLabel, sameLabel);
  return { changes, returningPlayers: returning };
}

type Candidate = { teamA: TeamComposition; teamB: TeamComposition };

function makeComp(gk: GeneratorInput | null, players: GeneratorInput[]): TeamComposition {
  return { goalkeeper: gk, players, totalScore: compTotal(gk, players) };
}

/**
 * Genera candidatos por intercambios de jugadores de campo entre A y B
 * (los arqueros quedan fijos). Primero todos los swaps simples; el baseline
 * va incluido. Orden determinístico (sigue el orden de players, ya ordenado
 * por score desc / id).
 */
function singleSwapCandidates(A0: TeamComposition, B0: TeamComposition): Candidate[] {
  const out: Candidate[] = [{ teamA: A0, teamB: B0 }];
  for (let i = 0; i < A0.players.length; i++) {
    const inA = A0.players[i]!;
    for (let j = 0; j < B0.players.length; j++) {
      const inB = B0.players[j]!;
      const aPlayers = A0.players.map((p, k) => (k === i ? inB : p));
      const bPlayers = B0.players.map((p, k) => (k === j ? inA : p));
      out.push({
        teamA: makeComp(A0.goalkeeper, aPlayers),
        teamB: makeComp(B0.goalkeeper, bPlayers),
      });
    }
  }
  return out;
}

/** Swaps dobles (dos intercambios simples disjuntos). Solo si los simples no alcanzan. */
function doubleSwapCandidates(A0: TeamComposition, B0: TeamComposition): Candidate[] {
  const out: Candidate[] = [];
  const na = A0.players.length;
  const nb = B0.players.length;
  for (let i1 = 0; i1 < na; i1++) {
    const a1 = A0.players[i1]!;
    for (let j1 = 0; j1 < nb; j1++) {
      const b1 = B0.players[j1]!;
      for (let i2 = i1 + 1; i2 < na; i2++) {
        const a2 = A0.players[i2]!;
        for (let j2 = j1 + 1; j2 < nb; j2++) {
          const b2 = B0.players[j2]!;
          const aPlayers = A0.players.map((p, k) => (k === i1 ? b1 : k === i2 ? b2 : p));
          const bPlayers = B0.players.map((p, k) => (k === j1 ? a1 : k === j2 ? a2 : p));
          out.push({
            teamA: makeComp(A0.goalkeeper, aPlayers),
            teamB: makeComp(B0.goalkeeper, bPlayers),
          });
        }
      }
    }
  }
  return out;
}

// Firma determinística para desempatar candidatos con igual diff/changes.
function candidateSignature(c: Candidate): string {
  return [...compIds(c.teamA)].sort().join(",");
}

/**
 * FUT-87: genera teams balanceados PERO evitando repetir la composición de la
 * fecha anterior. Determinístico.
 *
 * - Sin fecha anterior (o <minChanges jugadores repetidos): devuelve el baseline.
 * - Con fecha anterior: busca, entre el baseline y sus variaciones por swaps,
 *   un split con |scoreA−scoreB| dentro de la tolerancia Y ≥minChanges cambios
 *   de grupo; elige el más balanceado.
 * - Si ninguno cumple las dos cosas: fallback al baseline (mejor balance) con
 *   un warning de que no se pudo variar.
 */
export function generateTeamsWithVariety(
  input: GeneratorInput[],
  options: VarietyOptions = {},
): BalanceSummary {
  const tolerancePct = options.tolerancePct ?? 5;
  const minChanges = options.minChanges ?? 2;

  const { teamA: A0, teamB: B0, gkWarnings } = generateBaseline(input);
  const prev = options.previous ?? null;

  const withinTolerance = (a: TeamComposition, b: TeamComposition): boolean => {
    const avg = (a.totalScore + b.totalScore) / 2;
    if (avg <= 0) return true;
    return Math.abs(a.totalScore - b.totalScore) / avg <= tolerancePct / 100;
  };

  const baselineChanges = prev ? countRegroup(compIds(A0), compIds(B0), prev) : null;

  // Sin historial útil: no hay nada que variar.
  if (!prev || !baselineChanges || baselineChanges.returningPlayers < minChanges) {
    const summary = assembleSummary(A0, B0, gkWarnings);
    summary.variety = {
      changes: baselineChanges?.changes ?? 0,
      returningPlayers: baselineChanges?.returningPlayers ?? 0,
      applied: false,
      satisfied: false,
    };
    return summary;
  }

  // El baseline (mejor balance) ya cumple variedad: usarlo tal cual.
  if (baselineChanges.changes >= minChanges) {
    const summary = assembleSummary(A0, B0, gkWarnings);
    summary.variety = {
      changes: baselineChanges.changes,
      returningPlayers: baselineChanges.returningPlayers,
      applied: false,
      satisfied: withinTolerance(A0, B0),
    };
    return summary;
  }

  // Buscar un split variado y balanceado. Primero swaps simples; si ninguno
  // sirve, swaps dobles.
  const pickBest = (candidates: Candidate[]): { cand: Candidate; changes: number } | null => {
    let best: { cand: Candidate; changes: number; diff: number; sig: string } | null = null;
    for (const c of candidates) {
      if (!withinTolerance(c.teamA, c.teamB)) continue;
      const { changes } = countRegroup(compIds(c.teamA), compIds(c.teamB), prev);
      if (changes < minChanges) continue;
      const diff = Math.abs(c.teamA.totalScore - c.teamB.totalScore);
      const sig = candidateSignature(c);
      if (
        !best ||
        diff < best.diff ||
        (diff === best.diff && changes > best.changes) ||
        (diff === best.diff && changes === best.changes && sig < best.sig)
      ) {
        best = { cand: c, changes, diff, sig };
      }
    }
    return best ? { cand: best.cand, changes: best.changes } : null;
  };

  const best = pickBest(singleSwapCandidates(A0, B0)) ?? pickBest(doubleSwapCandidates(A0, B0));

  if (best) {
    const summary = assembleSummary(best.cand.teamA, best.cand.teamB, gkWarnings);
    summary.variety = {
      changes: best.changes,
      returningPlayers: baselineChanges.returningPlayers,
      applied: true,
      satisfied: true,
    };
    return summary;
  }

  // No se pudo variar manteniendo el balance: fallback al baseline.
  const summary = assembleSummary(A0, B0, gkWarnings);
  summary.warnings.push(
    "No se pudo variar respecto de la fecha anterior sin desbalancear; se usó el mejor balance.",
  );
  summary.variety = {
    changes: baselineChanges.changes,
    returningPlayers: baselineChanges.returningPlayers,
    applied: false,
    satisfied: false,
  };
  return summary;
}
