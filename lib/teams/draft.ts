import type { Json } from "@/lib/supabase/database.types";

import type { BalanceSummary } from "./generate";

/**
 * Estructura del JSON guardado en convocatorias.team_draft.
 * Persiste solo IDs; el render hace el join con players para mostrar
 * scores y nombres.
 */
export type TeamDraft = {
  A: { goalkeeperPlayerId: string | null; playerIds: string[] };
  B: { goalkeeperPlayerId: string | null; playerIds: string[] };
};

export type TeamLabel = "A" | "B";

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isJsonObject(v: Json | undefined): v is { [k: string]: Json | undefined } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseSide(v: Json | undefined): TeamDraft["A"] | null {
  if (!isJsonObject(v)) return null;
  const gk = v.goalkeeperPlayerId;
  if (gk !== null && typeof gk !== "string") return null;
  if (!isStringArray(v.playerIds)) return null;
  return { goalkeeperPlayerId: gk, playerIds: v.playerIds };
}

/**
 * Parsea el JSON crudo del DB. Si el shape no es válido, devuelve null
 * (el caller actúa como si no hubiera draft).
 */
export function parseTeamDraft(raw: Json | null): TeamDraft | null {
  if (raw === null) return null;
  if (!isJsonObject(raw)) return null;
  const a = parseSide(raw.A);
  const b = parseSide(raw.B);
  if (!a || !b) return null;
  return { A: a, B: b };
}

/**
 * Convierte BalanceSummary (output del generador puro) a TeamDraft
 * (formato persistido).
 */
export function summaryToDraft(summary: BalanceSummary): TeamDraft {
  return {
    A: {
      goalkeeperPlayerId: summary.teamA.goalkeeper?.id ?? null,
      playerIds: summary.teamA.players.map((p) => p.id),
    },
    B: {
      goalkeeperPlayerId: summary.teamB.goalkeeper?.id ?? null,
      playerIds: summary.teamB.players.map((p) => p.id),
    },
  };
}

/**
 * Devuelve la ubicación actual de un player dentro del draft, o null si
 * no esta presente.
 */
export type PlayerLocation = { team: TeamLabel; isGoalkeeper: boolean };

export function findPlayer(draft: TeamDraft, playerId: string): PlayerLocation | null {
  if (draft.A.goalkeeperPlayerId === playerId) return { team: "A", isGoalkeeper: true };
  if (draft.B.goalkeeperPlayerId === playerId) return { team: "B", isGoalkeeper: true };
  if (draft.A.playerIds.includes(playerId)) return { team: "A", isGoalkeeper: false };
  if (draft.B.playerIds.includes(playerId)) return { team: "B", isGoalkeeper: false };
  return null;
}

function removePlayerFrom(draft: TeamDraft, playerId: string): TeamDraft {
  const next: TeamDraft = {
    A: {
      goalkeeperPlayerId:
        draft.A.goalkeeperPlayerId === playerId ? null : draft.A.goalkeeperPlayerId,
      playerIds: draft.A.playerIds.filter((id) => id !== playerId),
    },
    B: {
      goalkeeperPlayerId:
        draft.B.goalkeeperPlayerId === playerId ? null : draft.B.goalkeeperPlayerId,
      playerIds: draft.B.playerIds.filter((id) => id !== playerId),
    },
  };
  return next;
}

/**
 * Mueve un player al otro team como jugador normal. Si era GK del team
 * origen, ese slot queda vacío y el caller deberá warning-ear al admin.
 */
export function swapTeam(draft: TeamDraft, playerId: string): TeamDraft {
  const loc = findPlayer(draft, playerId);
  if (!loc) return draft;
  const cleaned = removePlayerFrom(draft, playerId);
  const target: TeamLabel = loc.team === "A" ? "B" : "A";
  return {
    ...cleaned,
    [target]: {
      goalkeeperPlayerId: cleaned[target].goalkeeperPlayerId,
      playerIds: [...cleaned[target].playerIds, playerId],
    },
  };
}

/**
 * Promueve un player a GK del team en el que está. El GK actual del team
 * (si había) pasa a jugadores normales del mismo team.
 */
export function promoteToGoalkeeper(draft: TeamDraft, playerId: string): TeamDraft {
  const loc = findPlayer(draft, playerId);
  if (!loc) return draft;
  if (loc.isGoalkeeper) return draft; // ya era GK

  const team = loc.team;
  const oldGk = draft[team].goalkeeperPlayerId;

  const playerIds = draft[team].playerIds.filter((id) => id !== playerId);
  if (oldGk) playerIds.push(oldGk);

  return {
    ...draft,
    [team]: {
      goalkeeperPlayerId: playerId,
      playerIds,
    },
  };
}

/**
 * Set de todos los players presentes en el draft (incluyendo GKs).
 */
export function draftPlayerIds(draft: TeamDraft): Set<string> {
  const s = new Set<string>();
  if (draft.A.goalkeeperPlayerId) s.add(draft.A.goalkeeperPlayerId);
  if (draft.B.goalkeeperPlayerId) s.add(draft.B.goalkeeperPlayerId);
  for (const id of draft.A.playerIds) s.add(id);
  for (const id of draft.B.playerIds) s.add(id);
  return s;
}
