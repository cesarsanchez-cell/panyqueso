// FUT-113 (Fase 12): tests del generador multi-equipo del modo presentismo.
// Correr con:  pnpm test:unit   (node --test --experimental-strip-types)

import assert from "node:assert/strict";
import { test } from "node:test";

import { type GeneratorInput } from "./generate.ts";
import { generateMultiTeams } from "./generate-multi.ts";

type Dims = { physical: number; mental: number; technical: number };

function mk(id: string, dims: Dims, opts: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    id,
    nombre: id,
    role_field: opts.role_field ?? "jugador_campo",
    position_pref: opts.position_pref ?? "mediocampista",
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

// Probador: NN con rating neutro 6, sin posición declarada (mediocampista por
// defecto, como entra en el alta).
function probador(id: string): GeneratorInput {
  return mk(id, { physical: 6, mental: 6, technical: 6 }, { internal_score: 6 });
}

function teamSize(t: { goalkeeper: GeneratorInput | null; players: GeneratorInput[] }): number {
  return t.players.length + (t.goalkeeper ? 1 : 0);
}

// Roster genérico de N jugadores de campo con dims variadas pero deterministas.
function roster(n: number, prefix = "p"): GeneratorInput[] {
  const out: GeneratorInput[] = [];
  for (let i = 0; i < n; i++) {
    out.push(
      mk(`${prefix}${i}`, {
        physical: 3 + (i % 7),
        mental: 4 + ((i * 3) % 6),
        technical: 5 + ((i * 5) % 5),
      }),
    );
  }
  return out;
}

test("2 equipos + banco: tamaños correctos y todos asignados", () => {
  const input = [gk("g1"), gk("g2"), ...roster(10)]; // 12 jugadores
  const res = generateMultiTeams(input, { numTeams: 2, teamSize: 5 });

  assert.equal(res.teams.length, 2);
  assert.equal(teamSize(res.teams[0]!), 5);
  assert.equal(teamSize(res.teams[1]!), 5);
  // 12 - 10 titulares = 2 suplentes.
  assert.equal(res.benchTotal, 2);

  // Conservación: arqueros + titulares de campo + suplentes = input.
  const all = new Set<string>();
  for (const t of res.teams) {
    if (t.goalkeeper) all.add(t.goalkeeper.id);
    for (const p of t.players) all.add(p.id);
    for (const b of t.bench) all.add(b.id);
  }
  assert.equal(all.size, input.length);
});

test("3 equipos exactos: 15 jugadores, K=5, sin banco", () => {
  const input = [gk("g1"), gk("g2"), gk("g3"), ...roster(12)]; // 15
  const res = generateMultiTeams(input, { numTeams: 3, teamSize: 5 });

  assert.equal(res.teams.length, 3);
  for (const t of res.teams) assert.equal(teamSize(t), 5);
  assert.equal(res.benchTotal, 0);
  for (const t of res.teams) assert.equal(t.bench.length, 0);
});

test("cada equipo arranca con un arquero cuando alcanzan", () => {
  const input = [gk("g1"), gk("g2"), gk("g3"), ...roster(12)];
  const res = generateMultiTeams(input, { numTeams: 3, teamSize: 5 });
  for (const t of res.teams) assert.ok(t.goalkeeper, `equipo ${t.label} sin arquero`);
});

test("faltan arqueros: warning y algún equipo sin arquero", () => {
  const input = [gk("g1"), ...roster(14)]; // 1 solo arquero puro
  const res = generateMultiTeams(input, { numTeams: 3, teamSize: 5 });
  // Se completa con mixto/posible si hay; acá no hay → al menos un warning.
  assert.ok(res.warnings.some((w) => /arquero/i.test(w)));
});

test("no alcanza la gente para el tamaño pedido: warning", () => {
  const input = roster(6); // 6 para 2 equipos de 5 = no llega
  const res = generateMultiTeams(input, { numTeams: 2, teamSize: 5 });
  assert.ok(res.warnings.some((w) => /no alcanza/i.test(w)));
});

test("banco repartido parejo entre los bandos (±1)", () => {
  const input = [gk("g1"), gk("g2"), ...roster(13)]; // 15 -> 10 titulares + 5 banco
  const res = generateMultiTeams(input, { numTeams: 2, teamSize: 5 });
  assert.equal(res.benchTotal, 5);
  const sizes = res.teams.map((t) => t.bench.length).sort();
  // 5 suplentes en 2 bandos -> 2 y 3.
  assert.deepEqual(sizes, [2, 3]);
});

test("probadores (rating 6) se reparten sin romper el armado", () => {
  const input = [
    gk("g1"),
    gk("g2"),
    ...roster(6),
    probador("nn1"),
    probador("nn2"),
    probador("nn3"),
    probador("nn4"),
  ];
  const res = generateMultiTeams(input, { numTeams: 2, teamSize: 5 });
  assert.equal(res.teams.length, 2);
  for (const t of res.teams) assert.equal(teamSize(t), 5);
  // 12 jugadores, 10 titulares -> 2 al banco.
  assert.equal(res.benchTotal, 2);
});

test("balance: la diferencia de score entre equipos es chica", () => {
  const input = [gk("g1"), gk("g2"), ...roster(10)];
  const res = generateMultiTeams(input, { numTeams: 2, teamSize: 5 });
  const diff = Math.abs(res.teams[0]!.startersScore - res.teams[1]!.startersScore);
  const avg = (res.teams[0]!.startersScore + res.teams[1]!.startersScore) / 2;
  assert.ok(diff / avg <= 0.15, `diferencia de score demasiado alta: ${diff}`);
});

test("determinístico: mismo input -> mismo output", () => {
  const input = [gk("g1"), gk("g2"), gk("g3"), ...roster(14)];
  const a = generateMultiTeams(input, { numTeams: 3, teamSize: 5 });
  const b = generateMultiTeams(input, { numTeams: 3, teamSize: 5 });
  const ids = (r: typeof a) =>
    r.teams.map((t) => [
      t.goalkeeper?.id ?? "-",
      t.players.map((p) => p.id),
      t.bench.map((p) => p.id),
    ]);
  assert.deepEqual(ids(a), ids(b));
});

test("clamp: numTeams fuera de rango se acota a [2,3]", () => {
  const input = [gk("g1"), gk("g2"), ...roster(10)];
  const uno = generateMultiTeams(input, { numTeams: 1, teamSize: 5 });
  assert.equal(uno.teams.length, 2);
  const cuatro = generateMultiTeams(input, { numTeams: 4, teamSize: 5 });
  assert.equal(cuatro.teams.length, 3);
});
