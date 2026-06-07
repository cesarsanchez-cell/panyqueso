import assert from "node:assert/strict";
import { test } from "node:test";

import { playerLabel } from "./label.ts";

test("playerLabel: con apodo, muestra solo el apodo", () => {
  assert.equal(playerLabel("Lionel Messi", "Pulga"), "Pulga");
});

test("playerLabel: sin apodo, cae al nombre", () => {
  assert.equal(playerLabel("Juan Perez", null), "Juan Perez");
  assert.equal(playerLabel("Juan Perez", undefined), "Juan Perez");
  assert.equal(playerLabel("Juan Perez", "  "), "Juan Perez");
});

test("playerLabel: apodo con espacios se recorta", () => {
  assert.equal(playerLabel("Juan Perez", "  Colo  "), "Colo");
});

test("playerLabel: sin apodo ni nombre, devuelve guion", () => {
  assert.equal(playerLabel(null, null), "—");
  assert.equal(playerLabel("", ""), "—");
});
