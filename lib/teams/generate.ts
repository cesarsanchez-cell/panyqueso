/**
 * Generador de teams determinístico.
 *
 * FUT-95 — Balance por rubro: además del score total, el reparto busca que
 * FÍSICO (efectivo, con factor de edad), MENTAL y TÉCNICA queden parejos entre
 * los dos equipos (los tres pesan igual), y que defensores/mediocampistas/
 * delanteros se distribuyan en forma proporcional. Así se evita que un equipo
 * junte todo el físico y el otro toda la técnica (partido desparejo aunque el
 * score "empate").
 *
 * Algoritmo:
 *   1. Arqueros: 1 por equipo. Prioridad role_field='arquero' → quien tenga
 *      'arquero' en sus posiciones alternativas → mejor 'mixto'. Si falta, warning.
 *   2. Resto: reparto que minimiza una función de costo = desbalance de los 3
 *      rubros (físico efectivo + mental + técnica) + desbalance de posiciones
 *      (secundario). Greedy base + búsqueda local por intercambios (hill-climb).
 *   3. Variedad (FUT-87): entre los splits balanceados y dentro de la tolerancia
 *      de score, se prefiere uno que cambie ≥2 jugadores vs la fecha anterior.
 *
 * Determinístico: mismo input -> mismo output (desempates por id / firma).
 * No persiste nada.
 */

import type { Database } from "@/lib/supabase/database.types";

type RoleField = Database["public"]["Enums"]["player_role_field"];
type PositionPref = Database["public"]["Enums"]["position_pref"];
type LiderazgoNivel = Database["public"]["Enums"]["liderazgo_nivel"];

export type GeneratorInput = {
  id: string;
  nombre: string;
  role_field: RoleField;
  position_pref: PositionPref;
  internal_score: number;
  // FUT-95: dimensiones para el balance por rubro. Opcionales para no romper
  // llamadas viejas; si faltan, se asume el valor del score (degradación
  // elegante: el balance por rubro coincide con el balance por score).
  physical?: number;
  mental?: number;
  technical?: number;
  edad?: number;
  positions_possible?: PositionPref[];
  // FUT-127: liderazgo del jugador EN el grupo. No es una skill (no entra al
  // score): es un POTENCIADOR de equipo. El equipo que tiene un líder multiplica
  // su score en el balance por el coeficiente del nivel (ver LeaderCoefs).
  liderazgo?: LiderazgoNivel;
};

/**
 * FUT-127: coeficientes de potenciación por nivel de líder (vienen de
 * app_settings). 1.00 = sin efecto. 'ninguno' siempre es 1.
 */
export type LeaderCoefs = { medio: number; alto: number };

/** Sin potenciación: el default mientras el admin no ajusta los coeficientes. */
export const NO_LEADER_BOOST: LeaderCoefs = { medio: 1, alto: 1 };

export type LeaderInfo = { nivel: LiderazgoNivel; coef: number };

const LEVEL_RANK: Record<LiderazgoNivel, number> = { ninguno: 0, medio: 1, alto: 2 };

function leaderCoef(nivel: LiderazgoNivel | undefined, coefs: LeaderCoefs): number {
  if (nivel === "alto") return coefs.alto;
  if (nivel === "medio") return coefs.medio;
  return 1;
}

/**
 * Líder "que cuenta" de un conjunto de jugadores: el de MAYOR coeficiente (no
 * acumulativo, si hay dos líderes solo puntúa uno; empate de coef → el de mayor
 * nivel). Sin líder, nivel 'ninguno'/coef 1. Exportado para reusar en el
 * generador multi-equipo (la unidad de potenciación tiene que ser idéntica).
 */
export function leaderOf(players: GeneratorInput[], coefs: LeaderCoefs): LeaderInfo {
  let best: LeaderInfo = { nivel: "ninguno", coef: 1 };
  for (const p of players) {
    const nivel = p.liderazgo ?? "ninguno";
    const coef = leaderCoef(nivel, coefs);
    if (coef > best.coef || (coef === best.coef && LEVEL_RANK[nivel] > LEVEL_RANK[best.nivel])) {
      best = { nivel, coef };
    }
  }
  return best;
}

function teamLeader(comp: TeamComposition, coefs: LeaderCoefs): LeaderInfo {
  return leaderOf(comp.goalkeeper ? [comp.goalkeeper, ...comp.players] : comp.players, coefs);
}

function teamLeaderCoef(comp: TeamComposition, coefs: LeaderCoefs): number {
  return teamLeader(comp, coefs).coef;
}

export type TeamLabel = "A" | "B";

export type TeamComposition = {
  goalkeeper: GeneratorInput | null;
  players: GeneratorInput[]; // jugadores de campo (sin contar GK)
  totalScore: number;
};

// FUT-95: totales por rubro de un equipo (incluye al arquero). El físico es
// "efectivo" = físico × factor de edad, igual que en el score interno v2.
export type TeamDimensions = {
  physEff: number;
  mental: number;
  technical: number;
};

export type BalanceSummary = {
  teamA: TeamComposition;
  teamB: TeamComposition;
  totalDiff: number;
  positionDist: {
    A: Record<PositionPref, number>;
    B: Record<PositionPref, number>;
  };
  // FUT-95: totales por rubro por equipo (para mostrar el balance al admin).
  dimensions: {
    A: TeamDimensions;
    B: TeamDimensions;
  };
  // FUT-127: líder efectivo de cada equipo (el de mayor coef) y su coeficiente.
  // nivel 'ninguno'/coef 1 = el equipo no tiene líder. Con coeficientes en 1.00
  // (default) coef siempre es 1 pero nivel refleja igual si hay líder.
  leaders: {
    A: { nivel: LiderazgoNivel; coef: number };
    B: { nivel: LiderazgoNivel; coef: number };
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

// Peso del desbalance de posiciones dentro del costo. Los 3 rubros pesan 1 cada
// uno (suma de diferencias); las posiciones son objetivo secundario.
// Exportado para que el generador multi-equipo (generate-multi.ts) use el mismo peso.
export const POSITION_WEIGHT = 0.5;
const EPS = 1e-9;

/**
 * FUT-85/95: factor de edad sobre el físico (mismos escalones que la DB).
 * ≤35 1.00 · 36–45 0.90 · 46–55 0.80 · 56–65 0.70 · 66+ 0.60.
 */
export function agePhysicalFactor(edad: number | null | undefined): number {
  if (edad == null) return 1.0;
  if (edad <= 35) return 1.0;
  if (edad <= 45) return 0.9;
  if (edad <= 55) return 0.8;
  if (edad <= 65) return 0.7;
  return 0.6;
}

/** Físico efectivo (con descuento de edad). */
export function effectivePhysical(physical: number, edad: number | null | undefined): number {
  return physical * agePhysicalFactor(edad);
}

// Rubros de un jugador, con fallback al score si no vienen las dimensiones.
function playerDims(p: GeneratorInput): TeamDimensions {
  const physical = p.physical ?? p.internal_score;
  const mental = p.mental ?? p.internal_score;
  const technical = p.technical ?? p.internal_score;
  return {
    physEff: effectivePhysical(physical, p.edad),
    mental,
    technical,
  };
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
 * Suma de rubros (físico efectivo + mental + técnica) de un conjunto de jugadores.
 * Exportada para reusar en el generador multi-equipo: la unidad de medida del
 * balance tiene que ser idéntica al generador de 2 equipos.
 */
export function dimensionsOf(players: GeneratorInput[]): TeamDimensions {
  const acc: TeamDimensions = { physEff: 0, mental: 0, technical: 0 };
  for (const p of players) {
    const d = playerDims(p);
    acc.physEff += d.physEff;
    acc.mental += d.mental;
    acc.technical += d.technical;
  }
  return acc;
}

// Suma de rubros de un equipo (incluye al arquero).
function teamDimensions(comp: TeamComposition): TeamDimensions {
  return dimensionsOf(comp.goalkeeper ? [comp.goalkeeper, ...comp.players] : comp.players);
}

// Líneas de campo (el arquero va aparte).
const FIELD_LINES = ["defensor", "mediocampista", "delantero"] as const;
type FieldLine = (typeof FIELD_LINES)[number];
export type LineShares = Record<FieldLine, number>;

/**
 * FUT-95: "presencia" de un jugador repartida entre las líneas que puede cubrir.
 * La preferida pesa 1.0; cada posición posible pesa 0.5. Se normaliza para que
 * cada jugador sume 1 en total (no se doble-cuenta): un jugador flexible reparte
 * su presencia entre sus líneas, así puede ayudar a tapar el hueco de cualquier
 * equipo. Un jugador "puro" aporta 1.0 a su única línea. Si solo puede el arco
 * (sin líneas de campo), no aporta a la distribución de campo.
 */
export function fieldPositionShares(p: GeneratorInput): LineShares {
  const raw: LineShares = { defensor: 0, mediocampista: 0, delantero: 0 };
  const possible = p.positions_possible ?? [];
  for (const line of FIELD_LINES) {
    if (p.position_pref === line) raw[line] = 1.0;
    else if (possible.includes(line)) raw[line] = 0.5;
  }
  const sum = raw.defensor + raw.mediocampista + raw.delantero;
  if (sum === 0) return raw;
  return {
    defensor: raw.defensor / sum,
    mediocampista: raw.mediocampista / sum,
    delantero: raw.delantero / sum,
  };
}

/**
 * Forma (presencia por línea def/medio/del) de un conjunto de jugadores de campo.
 * Exportada para reusar en el generador multi-equipo.
 */
export function shapeOf(fieldPlayers: GeneratorInput[]): LineShares {
  const acc: LineShares = { defensor: 0, mediocampista: 0, delantero: 0 };
  for (const p of fieldPlayers) {
    const s = fieldPositionShares(p);
    acc.defensor += s.defensor;
    acc.mediocampista += s.mediocampista;
    acc.delantero += s.delantero;
  }
  return acc;
}

// Forma del equipo: suma de la presencia por línea de sus jugadores de campo.
function teamShape(comp: TeamComposition): LineShares {
  return shapeOf(comp.players);
}

/**
 * FUT-95: costo de desbalance entre dos equipos. Suma las diferencias de los 3
 * rubros (físico efectivo, mental, técnica) + la diferencia de "forma" por línea
 * (def/medio/del), contando la presencia repartida según preferida + posibles.
 * Más bajo = más parejo. Las posiciones son objetivo secundario (POSITION_WEIGHT).
 */
function balanceCost(a: TeamComposition, b: TeamComposition, coefs: LeaderCoefs): number {
  // FUT-127: el líder potencia el score del equipo. El balance se mide a
  // "puntuación final" = rubros × coef del líder de cada equipo. Con coef 1
  // (default) esto es idéntico al balance por rubro de FUT-95.
  const ca = teamLeaderCoef(a, coefs);
  const cb = teamLeaderCoef(b, coefs);
  const da = teamDimensions(a);
  const db = teamDimensions(b);
  const dimCost =
    Math.abs(da.physEff * ca - db.physEff * cb) +
    Math.abs(da.mental * ca - db.mental * cb) +
    Math.abs(da.technical * ca - db.technical * cb);

  const pa = teamShape(a);
  const pb = teamShape(b);
  const posCost =
    Math.abs(pa.defensor - pb.defensor) +
    Math.abs(pa.mediocampista - pb.mediocampista) +
    Math.abs(pa.delantero - pb.delantero);

  return dimCost + POSITION_WEIGHT * posCost;
}

/**
 * Asigna 2 arqueros (uno por team). Prioridad en escalones (toma los 2 mejores
 * por score respetando el orden, sin repetir gente):
 *   1. Rol = Arquero (arqueros puros).
 *   2. Posición preferida = Arquero.
 *   3. Posiciones posibles incluye "Arquero".
 *   4. Rol = Mixto (último recurso, para no dejar un equipo sin arquero).
 * Devuelve los GKs y los players que quedan para distribución de campo.
 */
function pickGoalkeepers(input: GeneratorInput[]): {
  gkA: GeneratorInput | null;
  gkB: GeneratorInput | null;
  remaining: GeneratorInput[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const sorted = sortByScoreDesc(input);

  const isPure = (p: GeneratorInput) => p.role_field === "arquero";
  // Escalones de prioridad. El dedup por `seen` garantiza que cada jugador
  // entre por su escalón más alto (un puro nunca cae al de preferida, etc.).
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

  const gkA = pool[0] ?? null;
  const gkB = pool[1] ?? null;

  const pureCount = sorted.filter(isPure).length;
  if (pureCount < 2) {
    if (gkA && gkB) {
      warnings.push(
        "No hay dos arqueros: se completó con quien puede atajar (preferida/posible/mixto). Revisá antes de confirmar.",
      );
    } else if (gkA && !gkB) {
      warnings.push("Solo hay un arquero posible. El otro equipo queda sin arquero.");
    } else {
      warnings.push("No hay arqueros ni jugadores que puedan atajar. Asigná arqueros a mano.");
    }
  }

  const usedIds = new Set<string>();
  if (gkA) usedIds.add(gkA.id);
  if (gkB) usedIds.add(gkB.id);
  const remaining = sorted.filter((p) => !usedIds.has(p.id));

  return { gkA, gkB, remaining, warnings };
}

function compTotal(gk: GeneratorInput | null, players: GeneratorInput[]): number {
  return (gk?.internal_score ?? 0) + players.reduce((acc, p) => acc + p.internal_score, 0);
}

function makeComp(gk: GeneratorInput | null, players: GeneratorInput[]): TeamComposition {
  return { goalkeeper: gk, players, totalScore: compTotal(gk, players) };
}

// Magnitud combinada de un jugador (para ordenar el reparto base). Los 3 rubros
// pesan igual; desempate por id para determinismo.
function magnitude(p: GeneratorInput): number {
  const d = playerDims(p);
  return d.physEff + d.mental + d.technical;
}

/**
 * Reparto base (greedy determinístico) minimizando el costo de balance por
 * rubro. Mantiene los equipos parejos en cantidad (±1). Devuelve composiciones
 * + warnings de arquero, para reusarse en generateTeams y en variedad.
 */
function generateBaseline(
  input: GeneratorInput[],
  coefs: LeaderCoefs,
): {
  teamA: TeamComposition;
  teamB: TeamComposition;
  gkWarnings: string[];
} {
  const { gkA, gkB, remaining, warnings } = pickGoalkeepers(input);

  let teamA = makeComp(gkA, []);
  let teamB = makeComp(gkB, []);

  // Orden de reparto: de mayor a menor magnitud (los más "pesados" primero),
  // desempate por id.
  const ordered = [...remaining].sort((a, b) => {
    const ma = magnitude(a);
    const mb = magnitude(b);
    if (mb !== ma) return mb - ma;
    return a.id.localeCompare(b.id);
  });

  for (const p of ordered) {
    const sizeA = teamA.players.length;
    const sizeB = teamB.players.length;

    // Guardia de tamaño: no dejar que un equipo supere al otro por más de 1.
    let target: TeamLabel | null = null;
    if (sizeA - sizeB >= 1) target = "B";
    else if (sizeB - sizeA >= 1) target = "A";

    if (target === null) {
      // Elegir el equipo que deje el menor costo de balance.
      const tryA = makeComp(teamA.goalkeeper, [...teamA.players, p]);
      const tryB = makeComp(teamB.goalkeeper, [...teamB.players, p]);
      const costA = balanceCost(tryA, teamB, coefs);
      const costB = balanceCost(teamA, tryB, coefs);
      target = costA <= costB ? "A" : "B";
    }

    if (target === "A") {
      teamA = makeComp(teamA.goalkeeper, [...teamA.players, p]);
    } else {
      teamB = makeComp(teamB.goalkeeper, [...teamB.players, p]);
    }
  }

  return { teamA, teamB, gkWarnings: warnings };
}

/** Arma el BalanceSummary final a partir de dos composiciones ya definidas. */
function assembleSummary(
  teamA: TeamComposition,
  teamB: TeamComposition,
  gkWarnings: string[],
  coefs: LeaderCoefs,
): BalanceSummary {
  const positionDist = {
    A: emptyPositionDist(),
    B: emptyPositionDist(),
  };
  for (const p of teamA.players) positionDist.A[p.position_pref]++;
  for (const p of teamB.players) positionDist.B[p.position_pref]++;

  const leaderA = teamLeader(teamA, coefs);
  const leaderB = teamLeader(teamB, coefs);

  const totalDiff = Math.abs(teamA.totalScore - teamB.totalScore);
  // FUT-127: la diferencia "efectiva" pondera el score por el coef del líder.
  // Con coeficientes en 1.00 coincide con totalDiff (comportamiento de FUT-95).
  const effDiff = Math.abs(teamA.totalScore * leaderA.coef - teamB.totalScore * leaderB.coef);

  const warnings = [...gkWarnings];
  if (effDiff > 2) {
    warnings.push(`Diferencia de score elevada (${effDiff.toFixed(2)}).`);
  }
  if (Math.abs(teamCount(teamA) - teamCount(teamB)) > 1) {
    warnings.push("Los teams quedaron desbalanceados en cantidad.");
  }

  return {
    teamA,
    teamB,
    totalDiff,
    positionDist,
    dimensions: { A: teamDimensions(teamA), B: teamDimensions(teamB) },
    leaders: {
      A: { nivel: leaderA.nivel, coef: leaderA.coef },
      B: { nivel: leaderB.nivel, coef: leaderB.coef },
    },
    warnings,
  };
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
export function countRegroup(
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

/**
 * Genera candidatos por intercambios de jugadores de campo entre A y B
 * (los arqueros quedan fijos). El baseline va incluido (primer elemento).
 * Orden determinístico (sigue el orden de players).
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

// Firma determinística para desempatar candidatos con igual costo/cambios.
function candidateSignature(c: Candidate): string {
  return [...compIds(c.teamA)].sort().join(",");
}

/**
 * Búsqueda local (hill-climb) por intercambios simples: parte del baseline y
 * aplica el swap que más baja el costo de balance, hasta que no mejora.
 * Determinístico (desempate por firma).
 */
function refineBalance(A0: TeamComposition, B0: TeamComposition, coefs: LeaderCoefs): Candidate {
  let cur: Candidate = { teamA: A0, teamB: B0 };
  let curCost = balanceCost(cur.teamA, cur.teamB, coefs);

  for (let guard = 0; guard < 200; guard++) {
    let best: { cand: Candidate; cost: number; sig: string } | null = null;
    for (const c of singleSwapCandidates(cur.teamA, cur.teamB)) {
      const cost = balanceCost(c.teamA, c.teamB, coefs);
      if (cost >= curCost - EPS) continue; // solo mejoras estrictas
      const sig = candidateSignature(c);
      if (!best || cost < best.cost - EPS || (Math.abs(cost - best.cost) < EPS && sig < best.sig)) {
        best = { cand: c, cost, sig };
      }
    }
    if (!best) break;
    cur = best.cand;
    curCost = best.cost;
  }

  return cur;
}

export function generateTeams(
  input: GeneratorInput[],
  coefs: LeaderCoefs = NO_LEADER_BOOST,
): BalanceSummary {
  const { teamA, teamB, gkWarnings } = generateBaseline(input, coefs);
  const refined = refineBalance(teamA, teamB, coefs);
  return assembleSummary(refined.teamA, refined.teamB, gkWarnings, coefs);
}

/**
 * FUT-87 + FUT-95: genera teams balanceados por rubro y, además, evita repetir
 * la composición de la fecha anterior. Determinístico.
 *
 * - Calcula el split más parejo (baseline + hill-climb por rubro/posiciones).
 * - Sin fecha anterior (o <minChanges repetidos): devuelve ese split.
 * - Si ya difiere ≥minChanges de la fecha pasada: lo usa tal cual.
 * - Si no: busca, entre sus variaciones por swaps dentro de la tolerancia de
 *   score, una con ≥minChanges cambios, eligiendo la MÁS pareja por rubro.
 * - Si ninguna cumple: fallback al split más balanceado, con warning.
 */
export function generateTeamsWithVariety(
  input: GeneratorInput[],
  options: VarietyOptions = {},
  coefs: LeaderCoefs = NO_LEADER_BOOST,
): BalanceSummary {
  const tolerancePct = options.tolerancePct ?? 5;
  const minChanges = options.minChanges ?? 2;

  const base = generateBaseline(input, coefs);
  const refined = refineBalance(base.teamA, base.teamB, coefs);
  const A0 = refined.teamA;
  const B0 = refined.teamB;
  const gkWarnings = base.gkWarnings;
  const prev = options.previous ?? null;

  // FUT-127: la tolerancia se mide a puntuación final (score × coef del líder),
  // así un split con líderes en bandos distintos no se rechaza por su diferencia
  // de score crudo. Con coef 1 (default) es el score crudo de siempre.
  const withinTolerance = (a: TeamComposition, b: TeamComposition): boolean => {
    const effA = a.totalScore * teamLeaderCoef(a, coefs);
    const effB = b.totalScore * teamLeaderCoef(b, coefs);
    const avg = (effA + effB) / 2;
    if (avg <= 0) return true;
    return Math.abs(effA - effB) / avg <= tolerancePct / 100;
  };

  const withVariety = (
    a: TeamComposition,
    b: TeamComposition,
    v: VarietyResult,
  ): BalanceSummary => {
    const summary = assembleSummary(a, b, gkWarnings, coefs);
    summary.variety = v;
    return summary;
  };

  const baselineChanges = prev ? countRegroup(compIds(A0), compIds(B0), prev) : null;

  // Sin historial útil: no hay nada que variar.
  if (!prev || !baselineChanges || baselineChanges.returningPlayers < minChanges) {
    return withVariety(A0, B0, {
      changes: baselineChanges?.changes ?? 0,
      returningPlayers: baselineChanges?.returningPlayers ?? 0,
      applied: false,
      satisfied: false,
    });
  }

  // El split más balanceado ya cumple variedad: usarlo tal cual.
  if (baselineChanges.changes >= minChanges) {
    return withVariety(A0, B0, {
      changes: baselineChanges.changes,
      returningPlayers: baselineChanges.returningPlayers,
      applied: false,
      satisfied: withinTolerance(A0, B0),
    });
  }

  // Buscar un split variado y balanceado. Entre los que cumplen tolerancia +
  // ≥minChanges, se elige el MÁS pareja por rubro (menor costo); desempate por
  // más cambios y luego firma. Primero swaps simples; si no, dobles.
  const pickBest = (candidates: Candidate[]): { cand: Candidate; changes: number } | null => {
    let best: { cand: Candidate; changes: number; cost: number; sig: string } | null = null;
    for (const c of candidates) {
      if (!withinTolerance(c.teamA, c.teamB)) continue;
      const { changes } = countRegroup(compIds(c.teamA), compIds(c.teamB), prev);
      if (changes < minChanges) continue;
      const cost = balanceCost(c.teamA, c.teamB, coefs);
      const sig = candidateSignature(c);
      if (
        !best ||
        cost < best.cost - EPS ||
        (Math.abs(cost - best.cost) < EPS && changes > best.changes) ||
        (Math.abs(cost - best.cost) < EPS && changes === best.changes && sig < best.sig)
      ) {
        best = { cand: c, changes, cost, sig };
      }
    }
    return best ? { cand: best.cand, changes: best.changes } : null;
  };

  const best = pickBest(singleSwapCandidates(A0, B0)) ?? pickBest(doubleSwapCandidates(A0, B0));

  if (best) {
    return withVariety(best.cand.teamA, best.cand.teamB, {
      changes: best.changes,
      returningPlayers: baselineChanges.returningPlayers,
      applied: true,
      satisfied: true,
    });
  }

  // No se pudo variar manteniendo el balance: fallback al split más balanceado.
  const summary = withVariety(A0, B0, {
    changes: baselineChanges.changes,
    returningPlayers: baselineChanges.returningPlayers,
    applied: false,
    satisfied: false,
  });
  summary.warnings.push(
    "No se pudo variar respecto de la fecha anterior sin desbalancear; se usó el mejor balance.",
  );
  return summary;
}
