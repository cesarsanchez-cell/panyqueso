/**
 * Generador multi-equipo para el modo "presentismo en cancha" (FUT-113 / Fase 12).
 *
 * A diferencia del generador de convocatoria (generate.ts), que arma SIEMPRE 2
 * equipos A/B del mismo tamaño, acá el coordinador define en cancha:
 *   - cuántos equipos (2 o 3), y
 *   - el tamaño K de cada equipo (5v5 … 12v12).
 * Los que sobran quedan como SUPLENTES, repartidos entre los bandos con el mismo
 * criterio de balance (físico efectivo + mental + técnica + distribución por
 * línea def/medio/del).
 *
 * Reusa las primitivas puras de generate.ts (dimensionsOf, shapeOf,
 * POSITION_WEIGHT) para que la unidad de balance sea idéntica al generador de 2
 * equipos. No persiste nada y es determinístico (mismo input -> mismo output).
 *
 * Lo que NO hace (a propósito, es el plan inicial): no gestiona el entra/sale en
 * vivo. Las llegadas tarde se resuelven en la capa de UI (FUT-115) sumando al
 * bando con menos suplentes, sin re-balancear.
 */

import {
  type GeneratorInput,
  type LineShares,
  type TeamDimensions,
  POSITION_WEIGHT,
  dimensionsOf,
  shapeOf,
} from "./generate.ts";

const EPS = 1e-9;
const TEAM_LABELS = ["A", "B", "C"] as const;

export type MultiTeamOptions = {
  // Cantidad de equipos a armar. Soportado: 2 o 3.
  numTeams: number;
  // Tamaño objetivo de cada equipo (titulares por bando, incluye al arquero).
  teamSize: number;
};

export type MultiTeam = {
  label: string;
  goalkeeper: GeneratorInput | null;
  // Titulares de campo (sin contar el arquero).
  players: GeneratorInput[];
  // Suplentes asignados a este bando.
  bench: GeneratorInput[];
  // Score de los titulares (arquero + jugadores de campo).
  startersScore: number;
  // Totales por rubro de los titulares (para mostrar el balance).
  dimensions: TeamDimensions;
};

export type MultiBalanceSummary = {
  teams: MultiTeam[];
  // Total de suplentes repartidos.
  benchTotal: number;
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Helpers determinísticos
// ---------------------------------------------------------------------------

function sortByScoreDesc(arr: GeneratorInput[]): GeneratorInput[] {
  return [...arr].sort((a, b) => {
    if (b.internal_score !== a.internal_score) return b.internal_score - a.internal_score;
    return a.id.localeCompare(b.id);
  });
}

// "Magnitud" combinada de un jugador (los 3 rubros pesan igual). Se usa para
// repartir primero a los más pesados. Desempate por id afuera.
function magnitude(p: GeneratorInput): number {
  const d = dimensionsOf([p]);
  return d.physEff + d.mental + d.technical;
}

function sortByMagnitudeDesc(arr: GeneratorInput[]): GeneratorInput[] {
  return [...arr].sort((a, b) => {
    const ma = magnitude(a);
    const mb = magnitude(b);
    if (mb !== ma) return mb - ma;
    return a.id.localeCompare(b.id);
  });
}

function diffDims(a: TeamDimensions, b: TeamDimensions): number {
  return (
    Math.abs(a.physEff - b.physEff) +
    Math.abs(a.mental - b.mental) +
    Math.abs(a.technical - b.technical)
  );
}

function diffShape(a: LineShares, b: LineShares): number {
  return (
    Math.abs(a.defensor - b.defensor) +
    Math.abs(a.mediocampista - b.mediocampista) +
    Math.abs(a.delantero - b.delantero)
  );
}

// Costo de desbalance entre N conjuntos de jugadores: suma sobre todos los pares
// de (diferencia de rubros + POSITION_WEIGHT * diferencia de forma). Más bajo =
// más parejo. Generaliza balanceCost() de generate.ts a N grupos.
function pairwiseCost(groups: GeneratorInput[][]): number {
  const dims = groups.map((g) => dimensionsOf(g));
  const shapes = groups.map((g) => shapeOf(g));
  let cost = 0;
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      cost += diffDims(dims[i]!, dims[j]!) + POSITION_WEIGHT * diffShape(shapes[i]!, shapes[j]!);
    }
  }
  return cost;
}

// ---------------------------------------------------------------------------
// Arqueros: uno por equipo, por escalones de prioridad (igual que generate.ts,
// pero generalizado a `count` arqueros en vez de 2).
// ---------------------------------------------------------------------------
function pickGoalkeepers(
  input: GeneratorInput[],
  count: number,
): { gks: (GeneratorInput | null)[]; remaining: GeneratorInput[]; warnings: string[] } {
  const warnings: string[] = [];
  const sorted = sortByScoreDesc(input);

  const tiers: Array<(p: GeneratorInput) => boolean> = [
    (p) => p.role_field === "arquero",
    (p) => p.position_pref === "arquero",
    (p) => (p.positions_possible ?? []).includes("arquero"),
    (p) => p.role_field === "mixto",
  ];

  const seen = new Set<string>();
  const pool: GeneratorInput[] = [];
  for (const pred of tiers) {
    for (const p of sorted) {
      if (!seen.has(p.id) && pred(p)) {
        seen.add(p.id);
        pool.push(p);
      }
    }
  }

  const gks: (GeneratorInput | null)[] = [];
  for (let i = 0; i < count; i++) gks.push(pool[i] ?? null);

  const pureCount = sorted.filter((p) => p.role_field === "arquero").length;
  const assigned = gks.filter(Boolean).length;
  if (pureCount < count) {
    if (assigned === count) {
      warnings.push(
        `No hay ${count} arqueros: se completó con quien puede atajar (preferida/posible/mixto). Revisá antes de arrancar.`,
      );
    } else {
      warnings.push(
        `Faltan arqueros: ${assigned} de ${count} equipos quedaron con arquero. Asigná a mano.`,
      );
    }
  }

  const usedIds = new Set(gks.filter(Boolean).map((g) => g!.id));
  const remaining = sorted.filter((p) => !usedIds.has(p.id));
  return { gks, remaining, warnings };
}

// ---------------------------------------------------------------------------
// Reparto greedy de jugadores de campo en grupos, con tope de capacidad y
// llenado parejo (round-robin sobre el grupo con menos cupo usado), eligiendo el
// destino que minimiza el costo de balance. `seed[i]` son jugadores fijos del
// grupo i (p.ej. el arquero) que cuentan para el balance pero no para el cupo.
// ---------------------------------------------------------------------------
function distributeField(
  players: GeneratorInput[],
  numGroups: number,
  capacities: number[],
  seed: GeneratorInput[][],
): GeneratorInput[][] {
  const groups: GeneratorInput[][] = Array.from({ length: numGroups }, () => []);

  for (const p of sortByMagnitudeDesc(players)) {
    // Candidatos: grupos con cupo libre.
    const eligible: number[] = [];
    for (let i = 0; i < numGroups; i++) {
      if (groups[i]!.length < capacities[i]!) eligible.push(i);
    }
    if (eligible.length === 0) break; // todo lleno

    // Llenado parejo: solo los de menor cantidad actual de titulares de campo.
    const minSize = Math.min(...eligible.map((i) => groups[i]!.length));
    const balanced = eligible.filter((i) => groups[i]!.length === minSize);

    // Entre esos, el que deje el menor costo global. Desempate por índice (menor).
    let best: { idx: number; cost: number } | null = null;
    for (const i of balanced) {
      const trial = groups.map((g, k) =>
        k === i ? [...seed[k]!, ...g, p] : [...seed[k]!, ...g],
      );
      const cost = pairwiseCost(trial);
      if (!best || cost < best.cost - EPS) best = { idx: i, cost };
    }
    groups[best!.idx]!.push(p);
  }

  return groups;
}

// Búsqueda local: intercambia jugadores de campo entre pares de grupos mientras
// baje el costo. Determinístico (aplica la mejor mejora estricta por iteración).
// `seed[i]` se incluye en el costo pero nunca se mueve.
function refineSwaps(
  groups: GeneratorInput[][],
  seed: GeneratorInput[][],
): GeneratorInput[][] {
  const cur = groups.map((g) => [...g]);
  const withSeed = () => cur.map((g, k) => [...seed[k]!, ...g]);
  let curCost = pairwiseCost(withSeed());

  for (let guard = 0; guard < 200; guard++) {
    let best: { gi: number; ai: number; gj: number; bj: number; cost: number } | null = null;

    for (let gi = 0; gi < cur.length; gi++) {
      for (let gj = gi + 1; gj < cur.length; gj++) {
        for (let ai = 0; ai < cur[gi]!.length; ai++) {
          for (let bj = 0; bj < cur[gj]!.length; bj++) {
            const trial = cur.map((g) => [...g]);
            const tmp = trial[gi]![ai]!;
            trial[gi]![ai] = trial[gj]![bj]!;
            trial[gj]![bj] = tmp;
            const cost = pairwiseCost(trial.map((g, k) => [...seed[k]!, ...g]));
            if (cost < curCost - EPS && (!best || cost < best.cost - EPS)) {
              best = { gi, ai, gj, bj, cost };
            }
          }
        }
      }
    }

    if (!best) break;
    const tmp = cur[best.gi]![best.ai]!;
    cur[best.gi]![best.ai] = cur[best.gj]![best.bj]!;
    cur[best.gj]![best.bj] = tmp;
    curCost = best.cost;
  }

  return cur;
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------
export function generateMultiTeams(
  input: GeneratorInput[],
  options: MultiTeamOptions,
): MultiBalanceSummary {
  const numTeams = Math.max(2, Math.min(3, Math.trunc(options.numTeams)));
  const teamSize = Math.max(1, Math.trunc(options.teamSize));
  const warnings: string[] = [];

  // 1. Arqueros (uno por equipo).
  const { gks, remaining, warnings: gkWarnings } = pickGoalkeepers(input, numTeams);
  warnings.push(...gkWarnings);

  // 2. Cupo de campo por equipo = teamSize menos el arquero (si lo tiene).
  const fieldCap = gks.map((gk) => Math.max(0, teamSize - (gk ? 1 : 0)));
  const seed = gks.map((gk) => (gk ? [gk] : []));

  // 3. Titulares de campo: llenar cada equipo hasta su cupo, parejo y balanceado.
  const fieldStarters = sortByMagnitudeDesc(remaining);
  const totalFieldCap = fieldCap.reduce((a, b) => a + b, 0);
  const startersPool = fieldStarters.slice(0, totalFieldCap);
  const benchPool = fieldStarters.slice(totalFieldCap);

  let starterGroups = distributeField(startersPool, numTeams, fieldCap, seed);
  starterGroups = refineSwaps(starterGroups, seed);

  // 4. Suplentes: repartir el sobrante parejo entre los bandos, mismo criterio.
  //    Sin cupo (todos entran); se balancea por cantidad y por rubro/posición.
  const benchCap = Array.from({ length: numTeams }, () => Number.POSITIVE_INFINITY);
  const emptySeed = Array.from({ length: numTeams }, () => [] as GeneratorInput[]);
  let benchGroups = distributeField(benchPool, numTeams, benchCap, emptySeed);
  benchGroups = refineSwaps(benchGroups, emptySeed);

  // 5. Ensamblar.
  const teams: MultiTeam[] = [];
  let filledTeams = 0;
  for (let i = 0; i < numTeams; i++) {
    const gk = gks[i];
    const players = starterGroups[i]!;
    const bench = benchGroups[i]!;
    const starters = gk ? [gk, ...players] : players;
    const startersScore = starters.reduce((acc, p) => acc + p.internal_score, 0);
    if (starters.length >= teamSize) filledTeams++;
    teams.push({
      label: TEAM_LABELS[i] ?? `Equipo ${i + 1}`,
      goalkeeper: gk ?? null,
      players,
      bench,
      startersScore,
      dimensions: dimensionsOf(starters),
    });
  }

  // 6. Warnings de tamaño / cantidad.
  if (filledTeams < numTeams) {
    warnings.push(
      `No alcanza la gente para ${numTeams} equipos de ${teamSize}. Bajá el tamaño o la cantidad de equipos.`,
    );
  }
  const benchTotal = benchPool.length;

  return { teams, benchTotal, warnings };
}
