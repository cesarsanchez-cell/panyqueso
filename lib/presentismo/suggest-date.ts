// Fecha sugerida para "Abrir cancha" en el modo presentismo.
//
// Regla (acordada): el default es el próximo día marcado del grupo desde hoy; si
// ese día ya tiene una sesión, salta +7 al siguiente día del grupo, y así hasta
// uno libre. Sólo cuentan como ocupadas las fechas que caen en el día del grupo:
// un partido adelantado en OTRO día (feriado) no corre la sugerencia.

const AR_TZ = "America/Argentina/Buenos_Aires";

/** "Hoy" en Argentina como 'YYYY-MM-DD'. */
export function todayInArgentina(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Parsea 'YYYY-MM-DD' a un Date en UTC (medianoche), TZ-safe. */
function parseUTC(iso: string): Date {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

/** Día de la semana (0=domingo … 6=sábado) de una fecha 'YYYY-MM-DD'. */
function dowOf(iso: string): number {
  return parseUTC(iso).getUTCDay();
}

/** Suma días a una fecha 'YYYY-MM-DD' (TZ-safe vía UTC). */
function addDays(iso: string, days: number): string {
  const dt = parseUTC(iso);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Próxima fecha libre para abrir cancha.
 *
 * @param todayISO  Hoy en formato 'YYYY-MM-DD' (usar {@link todayInArgentina}).
 * @param diaSemana Día del grupo, 0=domingo … 6=sábado (igual que Postgres dow).
 * @param taken     Fechas 'YYYY-MM-DD' ya ocupadas (convocatorias no canceladas).
 * @returns         La fecha sugerida 'YYYY-MM-DD'.
 */
export function suggestNextSessionDate(
  todayISO: string,
  diaSemana: number,
  taken: Iterable<string>,
): string {
  const takenSet = new Set(taken);
  const daysUntil = (diaSemana - dowOf(todayISO) + 7) % 7; // 0 si hoy es el día
  let candidate = addDays(todayISO, daysUntil);
  // Tope defensivo (~2 años de semanas) para no colgarse nunca.
  for (let i = 0; i < 110 && takenSet.has(candidate); i++) {
    candidate = addDays(candidate, 7);
  }
  return candidate;
}
