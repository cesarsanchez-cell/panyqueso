// FUT-95: tests del balance por rubro (físico/mental/técnica) + arquero alternativo.
// Correr con:  pnpm test:unit   (node --test --experimental-strip-types)

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  agePhysicalFactor,
  effectivePhysical,
  fieldPositionShares,
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

test("prioridad arquero: preferida=arquero gana sobre posible=arquero", () => {
  const roster: GeneratorInput[] = [
    gk("gk1"),
    mk("prefArq", { physical: 6, mental: 6, technical: 6 }, { position_pref: "arquero" }),
    mk(
      "posibleArq",
      { physical: 6, mental: 6, technical: 6 },
      {
        positions_possible: ["arquero", "defensor"],
      },
    ),
    mk("c1", { physical: 6, mental: 6, technical: 6 }),
    mk("c2", { physical: 6, mental: 6, technical: 6 }),
    mk("c3", { physical: 6, mental: 6, technical: 6 }),
  ];

  const s = generateTeams(roster);
  const gkIds = [s.teamA.goalkeeper!.id, s.teamB.goalkeeper!.id];
  // El 2º arquero es el de preferida=arquero, no el de posible.
  assert.ok(gkIds.includes("gk1"));
  assert.ok(gkIds.includes("prefArq"));
  assert.ok(!gkIds.includes("posibleArq"));
});

test("prioridad arquero: posible=arquero gana sobre mixto", () => {
  const roster: GeneratorInput[] = [
    gk("gk1"),
    mk("mixto", { physical: 6, mental: 6, technical: 6 }, { role_field: "mixto" }),
    mk(
      "posibleArq",
      { physical: 6, mental: 6, technical: 6 },
      {
        positions_possible: ["arquero"],
      },
    ),
    mk("c1", { physical: 6, mental: 6, technical: 6 }),
    mk("c2", { physical: 6, mental: 6, technical: 6 }),
    mk("c3", { physical: 6, mental: 6, technical: 6 }),
  ];

  const s = generateTeams(roster);
  const gkIds = [s.teamA.goalkeeper!.id, s.teamB.goalkeeper!.id];
  assert.ok(gkIds.includes("posibleArq"));
  assert.ok(!gkIds.includes("mixto"));
});

test("prioridad arquero: el mixto es el último recurso", () => {
  const roster: GeneratorInput[] = [
    gk("gk1"),
    mk("mixto", { physical: 6, mental: 6, technical: 6 }, { role_field: "mixto" }),
    mk("c1", { physical: 6, mental: 6, technical: 6 }),
    mk("c2", { physical: 6, mental: 6, technical: 6 }),
    mk("c3", { physical: 6, mental: 6, technical: 6 }),
    mk("c4", { physical: 6, mental: 6, technical: 6 }),
  ];

  const s = generateTeams(roster);
  // No hay otro candidato: el mixto termina al arco para no dejar a un equipo sin GK.
  const gkIds = [s.teamA.goalkeeper!.id, s.teamB.goalkeeper!.id];
  assert.ok(gkIds.includes("gk1"));
  assert.ok(gkIds.includes("mixto"));
});

test("presencia por línea: preferida 1.0, posible 0.5, normalizada a 1", () => {
  // Puro: toda su presencia en su línea.
  const puro = mk("d", { physical: 6, mental: 6, technical: 6 }, { position_pref: "defensor" });
  const sPuro = fieldPositionShares(puro);
  assert.equal(sPuro.defensor, 1);
  assert.equal(sPuro.mediocampista, 0);
  assert.equal(sPuro.delantero, 0);

  // Preferida defensor + posible medio: 1.0 / 0.5 → normalizado 0.667 / 0.333.
  const flex = mk(
    "f",
    { physical: 6, mental: 6, technical: 6 },
    {
      position_pref: "defensor",
      positions_possible: ["mediocampista"],
    },
  );
  const sFlex = fieldPositionShares(flex);
  assert.ok(Math.abs(sFlex.defensor - 2 / 3) < 1e-9);
  assert.ok(Math.abs(sFlex.mediocampista - 1 / 3) < 1e-9);
  // Suma siempre 1 (no se doble-cuenta).
  assert.ok(Math.abs(sFlex.defensor + sFlex.mediocampista + sFlex.delantero - 1) < 1e-9);

  // Solo arquero, sin líneas de campo: no aporta a la distribución de campo.
  const arq = mk("a", { physical: 6, mental: 6, technical: 6 }, { position_pref: "arquero" });
  const sArq = fieldPositionShares(arq);
  assert.equal(sArq.defensor + sArq.mediocampista + sArq.delantero, 0);
});

test("las posiciones posibles ayudan: el flexible tapa la línea más floja", () => {
  // Rubros iguales (las posiciones mandan el reparto). 3 defensores puros y
  // 2 delanteros puros + 1 delantero que TAMBIÉN puede defender. El flexible
  // debe ir al equipo con menos defensa para emparejar la forma.
  const roster: GeneratorInput[] = [
    gk("gk1"),
    gk("gk2"),
    mk("d1", { physical: 6, mental: 6, technical: 6 }, { position_pref: "defensor" }),
    mk("d2", { physical: 6, mental: 6, technical: 6 }, { position_pref: "defensor" }),
    mk("d3", { physical: 6, mental: 6, technical: 6 }, { position_pref: "defensor" }),
    mk("f1", { physical: 6, mental: 6, technical: 6 }, { position_pref: "delantero" }),
    mk("f2", { physical: 6, mental: 6, technical: 6 }, { position_pref: "delantero" }),
    mk(
      "flex",
      { physical: 6, mental: 6, technical: 6 },
      {
        position_pref: "delantero",
        positions_possible: ["defensor"],
      },
    ),
  ];

  const s = generateTeams(roster);
  const teamOf = (id: string) => (teamHas(s.teamA, id) ? "A" : "B");
  const pureDefs = ["d1", "d2", "d3"];
  const flexTeam = teamOf("flex");
  const defsConFlex = pureDefs.filter((d) => teamOf(d) === flexTeam).length;
  // El flexible (que puede defender) queda con el equipo de menos defensores
  // puros, no con el que ya tiene 2: usa su flexibilidad para emparejar.
  assert.ok(defsConFlex <= 1, `el flexible quedó con ${defsConFlex} defensores puros`);
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
