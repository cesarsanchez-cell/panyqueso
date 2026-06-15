/**
 * Snapshot del armado en cancha (modo presentismo, FUT-114/115).
 *
 * Convierte el resultado del generador multi-equipo en una estructura liviana
 * (solo id + nombre) que se persiste en convocatorias.presentismo_armado para
 * mostrar/exportar sin recalcular, y maneja las LLEGADAS TARDE: una vez armado,
 * el que cae se suma como suplente al bando con MENOS suplentes, sin re-balancear
 * (decisión del usuario; pueden quedar impares).
 *
 * Lógica pura (sin DB) → testeable con pnpm test:unit.
 */

import type { MultiBalanceSummary } from "./generate-multi.ts";

export type ArmadoPlayer = {
  id: string;
  nombre: string;
  // true = probador (registro fantasma). Solo para mostrarlo distinto en la UI.
  esProbador?: boolean;
};

export type ArmadoTeam = {
  label: string;
  goalkeeper: ArmadoPlayer | null;
  players: ArmadoPlayer[]; // titulares de campo
  bench: ArmadoPlayer[]; // suplentes de este bando
};

export type PresentismoArmado = {
  numTeams: number;
  teamSize: number;
  armadoAt: string; // ISO
  teams: ArmadoTeam[];
};

// Conjunto de ids marcados como probadores, para anotar el flag al mapear.
export function buildPresentismoArmado(
  summary: MultiBalanceSummary,
  opts: { numTeams: number; teamSize: number; guestIds?: Set<string>; armadoAt?: string },
): PresentismoArmado {
  const guests = opts.guestIds ?? new Set<string>();
  const mark = (p: { id: string; nombre: string }): ArmadoPlayer => ({
    id: p.id,
    nombre: p.nombre,
    esProbador: guests.has(p.id) ? true : undefined,
  });

  return {
    numTeams: opts.numTeams,
    teamSize: opts.teamSize,
    armadoAt: opts.armadoAt ?? new Date().toISOString(),
    teams: summary.teams.map((t) => ({
      label: t.label,
      goalkeeper: t.goalkeeper ? mark(t.goalkeeper) : null,
      players: t.players.map(mark),
      bench: t.bench.map(mark),
    })),
  };
}

/**
 * Llegada tarde: suma al jugador como suplente del bando con MENOS suplentes.
 * Empate → el de menor índice (determinístico). No re-balancea nada más.
 * Devuelve un armado nuevo (no muta el original).
 */
export function addLateArrivalToBench(
  armado: PresentismoArmado,
  player: ArmadoPlayer,
): PresentismoArmado {
  if (armado.teams.length === 0) return armado;

  let targetIdx = 0;
  for (let i = 1; i < armado.teams.length; i++) {
    if (armado.teams[i]!.bench.length < armado.teams[targetIdx]!.bench.length) {
      targetIdx = i;
    }
  }

  return {
    ...armado,
    teams: armado.teams.map((t, i) =>
      i === targetIdx ? { ...t, bench: [...t.bench, player] } : t,
    ),
  };
}

/** Todos los ids presentes en el armado (arqueros + titulares + suplentes). */
export function armadoPlayerIds(armado: PresentismoArmado): string[] {
  const ids: string[] = [];
  for (const t of armado.teams) {
    if (t.goalkeeper) ids.push(t.goalkeeper.id);
    for (const p of t.players) ids.push(p.id);
    for (const b of t.bench) ids.push(b.id);
  }
  return ids;
}
