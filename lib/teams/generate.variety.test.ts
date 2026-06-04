// FUT-87: tests del algoritmo de variedad (función pura).
// Correr con:  pnpm test:unit   (node --test --experimental-strip-types)

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  generateTeams,
  generateTeamsWithVariety,
  type GeneratorInput,
  type PreviousComposition,
} from "./generate.ts";

function player(id: string, score: number, gk = false): GeneratorInput {
  return {
    id,
    nombre: id,
    role_field: gk ? "arquero" : "jugador_campo",
    position_pref: gk ? "arquero" : "mediocampista",
    internal_score: score,
  };
}

// 2 arqueros + 8 jugadores de campo, todos con el mismo score: cualquier swap
// mantiene el balance exacto (diff 0), lo que aísla el comportamiento de variedad.
function roster(): GeneratorInput[] {
  const out = [player("gk1", 5, true), player("gk2", 5, true)];
  for (let i = 1; i <= 8; i++) out.push(player(`p${i}`, 5));
  return out;
}

function idsOf(team: { goalkeeper: GeneratorInput | null; players: GeneratorInput[] }): string[] {
  return (team.goalkeeper ? [team.goalkeeper.id] : []).concat(team.players.map((p) => p.id)).sort();
}

function compositionFrom(summary: ReturnType<typeof generateTeams>): PreviousComposition {
  return { teamA: idsOf(summary.teamA), teamB: idsOf(summary.teamB) };
}

test("sin fecha anterior: usa el baseline, sin variedad aplicada", () => {
  const r = roster();
  const s = generateTeamsWithVariety(r, { previous: null });
  const base = generateTeams(r);
  assert.equal(s.variety?.applied, false);
  assert.deepEqual(idsOf(s.teamA), idsOf(base.teamA));
  assert.deepEqual(idsOf(s.teamB), idsOf(base.teamB));
});

test("fecha anterior idéntica al baseline: fuerza ≥2 cambios manteniendo balance", () => {
  const r = roster();
  const previous = compositionFrom(generateTeams(r));
  const s = generateTeamsWithVariety(r, { previous });
  assert.equal(s.variety?.applied, true);
  assert.equal(s.variety?.satisfied, true);
  assert.ok((s.variety?.changes ?? 0) >= 2, "debe cambiar al menos 2 jugadores");
  assert.equal(s.totalDiff, 0, "con scores iguales el balance se mantiene perfecto");
});

test("menos de 2 jugadores repetidos: no se puede variar (fallback sin error)", () => {
  const r = roster();
  // Composición previa con ids que no están en el roster actual.
  const previous: PreviousComposition = { teamA: ["x1", "x2"], teamB: ["y1", "y2"] };
  const s = generateTeamsWithVariety(r, { previous });
  assert.equal(s.variety?.applied, false);
  assert.equal(s.variety?.satisfied, false);
  assert.equal(s.variety?.returningPlayers, 0);
});

test("determinístico: mismo input → mismo output", () => {
  const previous = compositionFrom(generateTeams(roster()));
  const a = generateTeamsWithVariety(roster(), { previous });
  const b = generateTeamsWithVariety(roster(), { previous });
  assert.deepEqual(idsOf(a.teamA), idsOf(b.teamA));
  assert.deepEqual(idsOf(a.teamB), idsOf(b.teamB));
});

test("tolerancia: si variar desbalancea más del 5%, cae al baseline con warning", () => {
  // 1 jugador de campo por equipo, con scores muy distintos: el único swap
  // posible (espejar) deja el mismo desbalance grande => ningún candidato
  // entra en la tolerancia y se cae al baseline.
  const r: GeneratorInput[] = [
    player("gk1", 5, true),
    player("gk2", 5, true),
    player("alto", 20),
    player("bajo", 1),
  ];
  const previous = compositionFrom(generateTeams(r));
  const s = generateTeamsWithVariety(r, { previous, tolerancePct: 5 });
  assert.equal(s.variety?.applied, false);
  assert.equal(s.variety?.satisfied, false);
  assert.ok(s.warnings.some((w) => w.includes("No se pudo variar")));
});
