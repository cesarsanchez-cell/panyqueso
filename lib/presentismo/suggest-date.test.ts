import { strict as assert } from "node:assert";
import { test } from "node:test";

import { suggestNextSessionDate, todayInArgentina } from "./suggest-date.ts";

// Grupo juega domingos (dow 0). Hoy = lunes 2026-06-15.
const HOY = "2026-06-15";
const DOMINGO = 0;

test("sin sesiones: sugiere el próximo domingo", () => {
  assert.equal(suggestNextSessionDate(HOY, DOMINGO, []), "2026-06-21");
});

test("un partido adelantado en otro día (jueves 18) NO corre la sugerencia", () => {
  assert.equal(suggestNextSessionDate(HOY, DOMINGO, ["2026-06-18"]), "2026-06-21");
});

test("si el domingo 21 ya tiene sesión, salta +7 a 28", () => {
  assert.equal(suggestNextSessionDate(HOY, DOMINGO, ["2026-06-21"]), "2026-06-28");
});

test("salta varios domingos ocupados hasta uno libre", () => {
  assert.equal(suggestNextSessionDate(HOY, DOMINGO, ["2026-06-21", "2026-06-28"]), "2026-07-05");
});

test("si hoy ES el día del grupo y está libre, sugiere hoy", () => {
  // 2026-06-21 es domingo.
  assert.equal(suggestNextSessionDate("2026-06-21", DOMINGO, []), "2026-06-21");
});

test("si hoy ES el día del grupo pero ya se jugó, salta a la semana siguiente", () => {
  assert.equal(suggestNextSessionDate("2026-06-21", DOMINGO, ["2026-06-21"]), "2026-06-28");
});

test("otro día de grupo: miércoles (dow 3) desde el lunes 15 → 17", () => {
  assert.equal(suggestNextSessionDate(HOY, 3, []), "2026-06-17");
});

test("todayInArgentina devuelve formato YYYY-MM-DD", () => {
  assert.match(todayInArgentina(new Date("2026-06-15T12:00:00Z")), /^\d{4}-\d{2}-\d{2}$/);
});

test("todayInArgentina respeta UTC-3 cerca de medianoche", () => {
  // 2026-06-16T01:00:00Z = 2026-06-15 22:00 en Argentina → sigue siendo el 15.
  assert.equal(todayInArgentina(new Date("2026-06-16T01:00:00Z")), "2026-06-15");
});
