// Tests de la lógica pura de confirmación de match (sugerencia #3 de la
// auditoría de Fase 9 post-prod). Correr con:  pnpm test:unit
//
// El foco es `checkWarnings`, en particular el caso del Major 1: un titular
// que se baja después de generar el draft queda fuera de `byId`, y eso debe
// BLOQUEAR la confirmación (pedir regenerar), no confirmar el draft viejo.

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildBalanceSnapshot, checkWarnings, type PlayerCore, sumScores } from "./confirm.ts";
import type { TeamDraft } from "./draft.ts";

function player(id: string, score: number, gk = false): PlayerCore {
  return {
    id,
    nombre: id,
    role_field: gk ? "arquero" : "jugador_campo",
    position_pref: gk ? "arquero" : "mediocampista",
    internal_score: score,
  };
}

function mapOf(players: PlayerCore[]): Map<string, PlayerCore> {
  return new Map(players.map((p) => [p.id, p]));
}

// 5v5 balanceado: cada lado GK + 4 de campo, todos score 5.
function balancedRoster(): { draft: TeamDraft; byId: Map<string, PlayerCore> } {
  const players: PlayerCore[] = [player("gkA", 5, true), player("gkB", 5, true)];
  for (let i = 1; i <= 4; i++) players.push(player(`a${i}`, 5));
  for (let i = 1; i <= 4; i++) players.push(player(`b${i}`, 5));

  const draft: TeamDraft = {
    A: { goalkeeperPlayerId: "gkA", playerIds: ["a1", "a2", "a3", "a4"] },
    B: { goalkeeperPlayerId: "gkB", playerIds: ["b1", "b2", "b3", "b4"] },
  };
  return { draft, byId: mapOf(players) };
}

test("draft balanceado y completo: sin warnings ni errores bloqueantes", () => {
  const { draft, byId } = balancedRoster();
  const { warnings, blockingErrors } = checkWarnings(draft, byId);
  assert.deepEqual(warnings, []);
  assert.deepEqual(blockingErrors, []);
});

test("Major 1: titular que se bajó (no está en byId) bloquea la confirmación", () => {
  const { draft, byId } = balancedRoster();
  // Simula que a3 declinó después de generar el draft: se lo saca de byId,
  // pero sigue en el draft viejo.
  byId.delete("a3");

  const { blockingErrors } = checkWarnings(draft, byId);
  assert.equal(blockingErrors.length, 1);
  assert.match(blockingErrors[0]!, /ya no son titulares/);
});

test("equipo por debajo del mínimo: error bloqueante", () => {
  const { byId } = balancedRoster();
  const draft: TeamDraft = {
    A: { goalkeeperPlayerId: "gkA", playerIds: ["a1", "a2"] }, // 3 < 5
    B: { goalkeeperPlayerId: "gkB", playerIds: ["b1", "b2", "b3", "b4"] },
  };
  const { blockingErrors } = checkWarnings(draft, byId);
  assert.ok(blockingErrors.some((e) => /Team A tiene solo 3/.test(e)));
});

test("falta arquero: warning (no bloqueante)", () => {
  const { byId } = balancedRoster();
  const draft: TeamDraft = {
    A: { goalkeeperPlayerId: null, playerIds: ["a1", "a2", "a3", "a4", "gkA"] },
    B: { goalkeeperPlayerId: "gkB", playerIds: ["b1", "b2", "b3", "b4"] },
  };
  const { warnings, blockingErrors } = checkWarnings(draft, byId);
  assert.deepEqual(blockingErrors, []);
  assert.ok(warnings.some((w) => /Team A sin arquero/.test(w)));
});

test("diferencia de score elevada: warning", () => {
  const players: PlayerCore[] = [player("gkA", 5, true), player("gkB", 5, true)];
  for (let i = 1; i <= 4; i++) players.push(player(`a${i}`, 10));
  for (let i = 1; i <= 4; i++) players.push(player(`b${i}`, 1));
  const byId = mapOf(players);
  const draft: TeamDraft = {
    A: { goalkeeperPlayerId: "gkA", playerIds: ["a1", "a2", "a3", "a4"] },
    B: { goalkeeperPlayerId: "gkB", playerIds: ["b1", "b2", "b3", "b4"] },
  };
  const { warnings } = checkWarnings(draft, byId);
  assert.ok(warnings.some((w) => /Diferencia de score elevada/.test(w)));
});

test("sumScores: suma presentes y reporta ausentes", () => {
  const byId = mapOf([player("x", 3), player("y", 4)]);
  const { total, missing } = sumScores(["x", "y", "z"], null, byId);
  assert.equal(total, 7);
  assert.deepEqual(missing, ["z"]);
});

test("sumScores: incluye al arquero en el total", () => {
  const byId = mapOf([player("gk", 6, true), player("x", 3)]);
  const { total, missing } = sumScores(["x"], "gk", byId);
  assert.equal(total, 9);
  assert.deepEqual(missing, []);
});

test("buildBalanceSnapshot: estructura, totales y filtra ausentes", () => {
  const { draft, byId } = balancedRoster();
  byId.delete("a4"); // ausente: no debe aparecer en players de A
  const snap = buildBalanceSnapshot(draft, byId, ["w1"], true) as Record<string, unknown>;

  assert.equal(snap.algorithm_version, "v1.0");
  assert.equal(snap.confirmed_with_warning, true);
  assert.deepEqual(snap.warnings, ["w1"]);

  const teams = snap.teams as Record<string, Record<string, unknown>>;
  // A tenía gkA + a1..a4; a4 ausente => 3 jugadores de campo en el snapshot.
  assert.equal((teams.A!.players as unknown[]).length, 3);
  // total de A incluye GK (5) + a1,a2,a3 (5 c/u) = 20 (a4 no suma).
  assert.equal(teams.A!.total_score, 20);
  assert.equal((teams.A!.goalkeeper as Record<string, unknown>).id, "gkA");
});
