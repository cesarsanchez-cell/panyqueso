// FUT-127: tests del liderazgo (positivo potencia, negativo penaliza acumulando).
// Correr con:  pnpm test:unit

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  generateTeams,
  NO_LEADER_BOOST,
  type GeneratorInput,
  type LeaderCoefs,
} from "./generate.ts";

function mk(id: string, score: number, opts: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    id,
    nombre: id,
    role_field: opts.role_field ?? "jugador_campo",
    position_pref: opts.position_pref ?? "mediocampista",
    internal_score: score,
    physical: opts.physical ?? score,
    mental: opts.mental ?? score,
    technical: opts.technical ?? score,
    edad: opts.edad ?? 30,
    liderazgo: opts.liderazgo,
  };
}

function gk(id: string): GeneratorInput {
  return mk(id, 5, { role_field: "arquero", position_pref: "arquero" });
}

function teamOf(s: ReturnType<typeof generateTeams>, id: string): "A" | "B" {
  const inA = s.teamA.goalkeeper?.id === id || s.teamA.players.some((p) => p.id === id);
  return inA ? "A" : "B";
}

test("coef 1.00 (default): el liderazgo no cambia el armado", () => {
  const base: GeneratorInput[] = [
    gk("gk1"),
    gk("gk2"),
    mk("a", 8),
    mk("b", 7),
    mk("c", 6),
    mk("d", 5),
  ];
  const conLider = base.map((p) => (p.id === "a" ? { ...p, liderazgo: "positivo" as const } : p));

  const s1 = generateTeams(base, NO_LEADER_BOOST);
  const s2 = generateTeams(conLider, NO_LEADER_BOOST);

  assert.deepEqual(
    s1.teamA.players.map((p) => p.id).sort(),
    s2.teamA.players.map((p) => p.id).sort(),
  );
  // El líder se reporta en el summary aunque el coef sea 1.
  const lado = teamOf(s2, "a");
  assert.equal(s2.leaders[lado].positivo, true);
  assert.equal(s2.leaders[lado].coef, 1);
});

test("dos líderes positivos caen en equipos distintos para equilibrar el coef", () => {
  const coefs: LeaderCoefs = { positivo: 1.3, negativo: 1 };
  const roster: GeneratorInput[] = [
    gk("gk1"),
    gk("gk2"),
    mk("L1", 6, { liderazgo: "positivo" }),
    mk("L2", 6, { liderazgo: "positivo" }),
    mk("c1", 6),
    mk("c2", 6),
    mk("c3", 6),
    mk("c4", 6),
  ];

  const s = generateTeams(roster, coefs);
  assert.notEqual(teamOf(s, "L1"), teamOf(s, "L2"));
  assert.equal(s.leaders.A.positivo, true);
  assert.equal(s.leaders.B.positivo, true);
});

test("positivo: el equipo con líder recibe menos score crudo para compensar el boost", () => {
  const coefs: LeaderCoefs = { positivo: 1.5, negativo: 1 };
  const roster: GeneratorInput[] = [
    gk("gk1"),
    gk("gk2"),
    mk("L", 6, { liderazgo: "positivo" }),
    mk("a", 9),
    mk("b", 8),
    mk("c", 7),
    mk("d", 6),
    mk("e", 5),
  ];

  const s = generateTeams(roster, coefs);
  const lado = teamOf(s, "L");
  const scoreLider = lado === "A" ? s.teamA.totalScore : s.teamB.totalScore;
  const scoreOtro = lado === "A" ? s.teamB.totalScore : s.teamA.totalScore;

  assert.ok(
    scoreLider < scoreOtro,
    `el equipo con líder debería tener menos score crudo: lider=${scoreLider} otro=${scoreOtro}`,
  );
});

test("negativo es acumulativo: dos quejosos pesan el doble (coef^2)", () => {
  const coefs: LeaderCoefs = { positivo: 1, negativo: 0.8 };
  // Dos quejosos. El coef de un equipo que los tuviera a ambos sería 0.8^2=0.64.
  const roster: GeneratorInput[] = [
    gk("gk1"),
    gk("gk2"),
    mk("Q1", 6, { liderazgo: "negativo" }),
    mk("Q2", 6, { liderazgo: "negativo" }),
    mk("c1", 6),
    mk("c2", 6),
    mk("c3", 6),
    mk("c4", 6),
  ];

  const s = generateTeams(roster, coefs);
  // Se reparten: un quejoso por equipo (no se amontonan).
  assert.notEqual(teamOf(s, "Q1"), teamOf(s, "Q2"));
  // Cada equipo cuenta 1 negativo → coef 0.8.
  assert.equal(s.leaders.A.negativos, 1);
  assert.equal(s.leaders.B.negativos, 1);
  assert.ok(Math.abs(s.leaders.A.coef - 0.8) < 1e-9);
});

test("positivo (no acumula) + negativo (acumula) se multiplican", () => {
  const coefs: LeaderCoefs = { positivo: 1.4, negativo: 0.9 };
  // Un equipo con un líder y dos quejosos: 1.4 × 0.9 × 0.9 = 1.134.
  const roster: GeneratorInput[] = [
    mk("L", 6, { liderazgo: "positivo" }),
    mk("Q1", 6, { liderazgo: "negativo" }),
    mk("Q2", 6, { liderazgo: "negativo" }),
  ];
  const s = generateTeams([gk("gk1"), gk("gk2"), ...roster, mk("c1", 6), mk("c2", 6)], coefs);
  const lado = teamOf(s, "L");
  // Si el reparto dejó al líder y los dos quejosos juntos, el coef sería 1.134;
  // verificamos la fórmula sobre el equipo del líder según lo que reporta.
  const lead = s.leaders[lado];
  const esperado = (lead.positivo ? 1.4 : 1) * Math.pow(0.9, lead.negativos);
  assert.ok(Math.abs(lead.coef - esperado) < 1e-9, `coef ${lead.coef} != ${esperado}`);
});
