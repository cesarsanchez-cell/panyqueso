// FUT-115 (Fase 12): tests del snapshot de armado presentismo + llegadas tarde.
// Correr con:  pnpm test:unit

import assert from "node:assert/strict";
import { test } from "node:test";

import { type GeneratorInput } from "./generate.ts";
import { generateMultiTeams } from "./generate-multi.ts";
import {
  addLateArrivalToBench,
  armadoPlayerIds,
  buildPresentismoArmado,
  type PresentismoArmado,
} from "./presentismo.ts";

function mk(id: string, score = 6): GeneratorInput {
  return {
    id,
    nombre: id,
    role_field: "jugador_campo",
    position_pref: "mediocampista",
    internal_score: score,
    physical: score,
    mental: score,
    technical: score,
    edad: 30,
  };
}

function gk(id: string): GeneratorInput {
  return { ...mk(id), role_field: "arquero", position_pref: "arquero" };
}

test("buildPresentismoArmado: conserva a todos y marca probadores", () => {
  const input = [gk("g1"), gk("g2"), ...Array.from({ length: 11 }, (_, i) => mk(`p${i}`))]; // 13
  const summary = generateMultiTeams(input, { numTeams: 2, teamSize: 5 });
  const armado = buildPresentismoArmado(summary, {
    numTeams: 2,
    teamSize: 5,
    guestIds: new Set(["p0"]),
    armadoAt: "2026-06-14T00:00:00.000Z",
  });

  assert.equal(armado.teams.length, 2);
  // 13 jugadores conservados (10 titulares + 3 banco).
  assert.equal(armadoPlayerIds(armado).length, 13);
  // El probador quedó marcado.
  const all = armado.teams.flatMap((t) => [
    ...(t.goalkeeper ? [t.goalkeeper] : []),
    ...t.players,
    ...t.bench,
  ]);
  assert.equal(all.find((p) => p.id === "p0")?.esProbador, true);
  assert.equal(all.find((p) => p.id === "p1")?.esProbador, undefined);
});

test("addLateArrivalToBench: va al bando con menos suplentes", () => {
  const armado: PresentismoArmado = {
    numTeams: 2,
    teamSize: 5,
    armadoAt: "x",
    teams: [
      { label: "A", goalkeeper: null, players: [], bench: [{ id: "a1", nombre: "a1" }] },
      { label: "B", goalkeeper: null, players: [], bench: [] },
    ],
  };
  const next = addLateArrivalToBench(armado, { id: "tarde", nombre: "Tarde" });
  // B tenía menos suplentes (0) → entra ahí.
  assert.equal(next.teams[1]!.bench.at(-1)?.id, "tarde");
  assert.equal(next.teams[0]!.bench.length, 1);
  // No muta el original.
  assert.equal(armado.teams[1]!.bench.length, 0);
});

test("addLateArrivalToBench: empate → bando de menor índice", () => {
  const armado: PresentismoArmado = {
    numTeams: 2,
    teamSize: 5,
    armadoAt: "x",
    teams: [
      { label: "A", goalkeeper: null, players: [], bench: [] },
      { label: "B", goalkeeper: null, players: [], bench: [] },
    ],
  };
  const next = addLateArrivalToBench(armado, { id: "t", nombre: "T" });
  assert.equal(next.teams[0]!.bench.length, 1);
  assert.equal(next.teams[1]!.bench.length, 0);
});
