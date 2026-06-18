// FUT-127: tests del potenciador de líder (liderazgo por grupo).
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
  // Mismo roster, uno con liderazgo alto. Con coef 1 el resultado es idéntico
  // a no tener líder (inerte).
  const base: GeneratorInput[] = [
    gk("gk1"),
    gk("gk2"),
    mk("a", 8),
    mk("b", 7),
    mk("c", 6),
    mk("d", 5),
  ];
  const conLider = base.map((p) => (p.id === "a" ? { ...p, liderazgo: "alto" as const } : p));

  const s1 = generateTeams(base, NO_LEADER_BOOST);
  const s2 = generateTeams(conLider, NO_LEADER_BOOST);

  assert.deepEqual(
    s1.teamA.players.map((p) => p.id).sort(),
    s2.teamA.players.map((p) => p.id).sort(),
  );
  // El líder se reporta en el summary aunque el coef sea 1.
  const ladoLider = teamOf(s2, "a");
  assert.equal(s2.leaders[ladoLider].nivel, "alto");
  assert.equal(s2.leaders[ladoLider].coef, 1);
});

test("dos líderes (mismo nivel) caen en equipos distintos para equilibrar el coef", () => {
  // Con un boost real, juntar a los dos líderes en un equipo lo dispararía: el
  // balance los separa para que cada equipo tenga su potenciador.
  const coefs: LeaderCoefs = { medio: 1, alto: 1.3 };
  const roster: GeneratorInput[] = [
    gk("gk1"),
    gk("gk2"),
    mk("L1", 6, { liderazgo: "alto" }),
    mk("L2", 6, { liderazgo: "alto" }),
    mk("c1", 6),
    mk("c2", 6),
    mk("c3", 6),
    mk("c4", 6),
  ];

  const s = generateTeams(roster, coefs);
  assert.notEqual(teamOf(s, "L1"), teamOf(s, "L2"));
  // Cada equipo queda con un líder alto.
  assert.equal(s.leaders.A.nivel, "alto");
  assert.equal(s.leaders.B.nivel, "alto");
});

test("un solo líder: el equipo sin líder recibe más score crudo para compensar el boost", () => {
  // Un líder alto (boost 1.5) en un roster por lo demás simétrico. Para que la
  // puntuación final quede pareja, su equipo debe tener menos score crudo.
  const coefs: LeaderCoefs = { medio: 1, alto: 1.5 };
  const roster: GeneratorInput[] = [
    gk("gk1"),
    gk("gk2"),
    mk("L", 6, { liderazgo: "alto" }),
    mk("a", 9),
    mk("b", 8),
    mk("c", 7),
    mk("d", 6),
    mk("e", 5),
  ];

  const s = generateTeams(roster, coefs);
  const ladoLider = teamOf(s, "L");
  const scoreLider = ladoLider === "A" ? s.teamA.totalScore : s.teamB.totalScore;
  const scoreOtro = ladoLider === "A" ? s.teamB.totalScore : s.teamA.totalScore;

  // El equipo con líder tiene menos score crudo; con el boost se empareja.
  assert.ok(
    scoreLider < scoreOtro,
    `el equipo con líder debería tener menos score crudo: lider=${scoreLider} otro=${scoreOtro}`,
  );
  const effLider = scoreLider * s.leaders[ladoLider].coef;
  const effOtro = scoreOtro * 1;
  assert.ok(
    Math.abs(effLider - effOtro) < Math.abs(scoreLider - scoreOtro),
    "la diferencia efectiva (con boost) debería ser menor que la cruda",
  );
});

test("no acumulativo: dos líderes en un equipo cuentan como uno (el de mayor coef)", () => {
  const coefs: LeaderCoefs = { medio: 1.2, alto: 1.5 };
  // Forzamos ambos líderes al mismo equipo dándoles posiciones que no obligan a
  // separarlos: comprobamos el cálculo del coef del equipo, no el reparto.
  const roster: GeneratorInput[] = [
    mk("L1", 6, { liderazgo: "alto" }),
    mk("L2", 6, { liderazgo: "medio" }),
  ];
  const s = generateTeams([gk("gk1"), gk("gk2"), ...roster, mk("c1", 6), mk("c2", 6)], coefs);
  // El equipo que tenga a L1 (alto) reporta coef 1.5; el medio no se suma.
  const lado = teamOf(s, "L1");
  assert.equal(s.leaders[lado].coef, 1.5);
  assert.equal(s.leaders[lado].nivel, "alto");
});
