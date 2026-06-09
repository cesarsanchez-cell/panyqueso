// FUT-95: tests del balance por rubro (físico/mental/técnica) + arquero alternativo.
// Correr con:  pnpm test:unit   (node --test --experimental-strip-types)

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  agePhysicalFactor,
  effectivePhysical,
  generateTeams,
  type GeneratorInput,
} from "./generate.ts";

type Dims = { physical: number; mental: number; technical: number };

function mk(id: string, dims: Dims, opts: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    id,
    nombre: id,
    role_field: opts.role_field ?? "jugador_campo",
    position_pref: opts.position_pref ?? "mediocampista",
    // El score no condiciona el balance por rubro, pero lo dejamos coherente.
    internal_score: opts.internal_score ?? (dims.physical + dims.mental + dims.technical) / 3,
    physical: dims.physical,
    mental: dims.mental,
    technical: dims.technical,
    edad: opts.edad ?? 30,
    positions_possible: opts.positions_possible,
  };
}

function gk(id: string): GeneratorInput {
  return mk(
    id,
    { physical: 5, mental: 5, technical: 5 },
    { role_field: "arquero", position_pref: "arquero" },
  );
}

function teamHas(
  team: { goalkeeper: GeneratorInput | null; players: GeneratorInput[] },
  id: string,
) {
  return team.goalkeeper?.id === id || team.players.some((p) => p.id === id);
}

test("factor de edad: escalones iguales a la DB", () => {
  assert.equal(agePhysicalFactor(30), 1.0);
  assert.equal(agePhysicalFactor(35), 1.0);
  assert.equal(agePhysicalFactor(40), 0.9);
  assert.equal(agePhysicalFactor(50), 0.8);
  assert.equal(agePhysicalFactor(60), 0.7);
  assert.equal(agePhysicalFactor(70), 0.6);
  assert.equal(agePhysicalFactor(null), 1.0);
  assert.equal(effectivePhysical(10, 60), 7);
});

test("reparte los rubros: no junta a los físicos de un lado", () => {
  // Dos jugadores muy físicos y dos muy técnicos, mismo score. Si solo se
  // balanceara el total, podrían quedar los 2 físicos juntos; el balance por
  // rubro los separa.
  const roster: GeneratorInput[] = [
    gk("gk1"),
    gk("gk2"),
    mk("fis1", { physical: 10, mental: 3, technical: 3 }),
    mk("fis2", { physical: 10, mental: 3, technical: 3 }),
    mk("tec1", { physical: 3, mental: 3, technical: 10 }),
    mk("tec2", { physical: 3, mental: 3, technical: 10 }),
  ];

  const s = generateTeams(roster);

  // Los dos físicos quedan en equipos distintos.
  assert.notEqual(teamHas(s.teamA, "fis1"), teamHas(s.teamA, "fis2"));
  // Y el físico efectivo queda parejo (diferencia chica).
  assert.ok(
    Math.abs(s.dimensions.A.physEff - s.dimensions.B.physEff) <= 1,
    `físico desbalanceado: A=${s.dimensions.A.physEff} B=${s.dimensions.B.physEff}`,
  );
  assert.ok(Math.abs(s.dimensions.A.technical - s.dimensions.B.technical) <= 1);
});

test("físico efectivo: un veterano físico no infla el balance", () => {
  // Mismo físico crudo (10) pero edades distintas: el de 60 rinde como 7.
  const roster: GeneratorInput[] = [
    gk("gk1"),
    gk("gk2"),
    mk("joven", { physical: 10, mental: 5, technical: 5 }, { edad: 30 }),
    mk("veterano", { physical: 10, mental: 5, technical: 5 }, { edad: 60 }),
    mk("medio1", { physical: 7, mental: 5, technical: 5 }, { edad: 30 }),
    mk("medio2", { physical: 8, mental: 5, technical: 5 }, { edad: 30 }),
  ];

  const s = generateTeams(roster);
  // El balance usa físico efectivo: joven(10) y veterano(7 efectivo) no son
  // intercambiables; el reparto debe quedar lo más parejo posible en físico
  // efectivo (el óptimo de este roster es una diferencia de 2).
  assert.ok(
    Math.abs(s.dimensions.A.physEff - s.dimensions.B.physEff) <= 2.5,
    `físico efectivo desbalanceado: A=${s.dimensions.A.physEff} B=${s.dimensions.B.physEff}`,
  );
});

test("arquero alternativo: si no hay 2 arqueros puros, usa quien pueda atajar", () => {
  const roster: GeneratorInput[] = [
    gk("gk1"),
    mk(
      "puedeAtajar",
      { physical: 6, mental: 6, technical: 6 },
      {
        positions_possible: ["arquero", "defensor"],
      },
    ),
    mk("c1", { physical: 6, mental: 6, technical: 6 }),
    mk("c2", { physical: 6, mental: 6, technical: 6 }),
    mk("c3", { physical: 6, mental: 6, technical: 6 }),
    mk("c4", { physical: 6, mental: 6, technical: 6 }),
  ];

  const s = generateTeams(roster);
  // Ambos equipos tienen arquero.
  assert.ok(s.teamA.goalkeeper !== null);
  assert.ok(s.teamB.goalkeeper !== null);
  // Uno de los arqueros es el que puede atajar como alternativa.
  const gkIds = [s.teamA.goalkeeper!.id, s.teamB.goalkeeper!.id];
  assert.ok(gkIds.includes("gk1"));
  assert.ok(gkIds.includes("puedeAtajar"));
  // Y se avisa que no había dos arqueros puros.
  assert.ok(s.warnings.some((w) => w.toLowerCase().includes("atajar")));
});

test("determinístico: mismo input → mismo output", () => {
  const roster: GeneratorInput[] = [
    gk("gk1"),
    gk("gk2"),
    mk("a", { physical: 8, mental: 4, technical: 6 }),
    mk("b", { physical: 4, mental: 8, technical: 6 }),
    mk("c", { physical: 6, mental: 6, technical: 8 }),
    mk("d", { physical: 7, mental: 5, technical: 5 }),
  ];
  const s1 = generateTeams(roster);
  const s2 = generateTeams(roster);
  assert.deepEqual(
    s1.teamA.players.map((p) => p.id).sort(),
    s2.teamA.players.map((p) => p.id).sort(),
  );
});
