"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/require-role";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { parseTeamDraft, type TeamDraft } from "@/lib/teams/draft";

const ALGORITHM_VERSION = "v1.0";
const MIN_PLAYERS_PER_TEAM = 5;

export type ConfirmMatchState = null | { error: string } | { warnings: string[] };

type PlayerCore = {
  id: string;
  nombre: string;
  role_field: "arquero" | "jugador_campo" | "mixto";
  position_pref: "defensor" | "mediocampista" | "delantero";
  internal_score: number;
};

function sumScores(
  ids: string[],
  gk: string | null,
  byId: Map<string, PlayerCore>,
): { total: number; missing: string[] } {
  let total = 0;
  const missing: string[] = [];
  const all = gk ? [gk, ...ids] : ids;
  for (const id of all) {
    const p = byId.get(id);
    if (!p) {
      missing.push(id);
      continue;
    }
    total += p.internal_score;
  }
  return { total, missing };
}

function positionDist(ids: string[], byId: Map<string, PlayerCore>) {
  const dist = { defensor: 0, mediocampista: 0, delantero: 0 };
  for (const id of ids) {
    const p = byId.get(id);
    if (p) dist[p.position_pref]++;
  }
  return dist;
}

function buildBalanceSnapshot(
  draft: TeamDraft,
  byId: Map<string, PlayerCore>,
  warnings: string[],
  confirmedWithWarning: boolean,
): Json {
  const sideJson = (s: TeamDraft["A"]) => {
    const gk = s.goalkeeperPlayerId ? (byId.get(s.goalkeeperPlayerId) ?? null) : null;
    const players = s.playerIds
      .map((id) => byId.get(id))
      .filter((p): p is PlayerCore => Boolean(p))
      .map((p) => ({
        id: p.id,
        nombre: p.nombre,
        internal_score: p.internal_score,
        position_pref: p.position_pref,
        role_field: p.role_field,
      }));

    const { total } = sumScores(s.playerIds, s.goalkeeperPlayerId, byId);

    return {
      goalkeeper: gk
        ? {
            id: gk.id,
            nombre: gk.nombre,
            internal_score: gk.internal_score,
            role_field: gk.role_field,
          }
        : null,
      players,
      total_score: total,
      position_distribution: positionDist(s.playerIds, byId),
    };
  };

  return {
    algorithm_version: ALGORITHM_VERSION,
    confirmed_with_warning: confirmedWithWarning,
    warnings,
    teams: {
      A: sideJson(draft.A),
      B: sideJson(draft.B),
    },
  } as Json;
}

function checkWarnings(
  draft: TeamDraft,
  byId: Map<string, PlayerCore>,
): { warnings: string[]; blockingErrors: string[] } {
  const warnings: string[] = [];
  const blockingErrors: string[] = [];

  const countA = draft.A.playerIds.length + (draft.A.goalkeeperPlayerId ? 1 : 0);
  const countB = draft.B.playerIds.length + (draft.B.goalkeeperPlayerId ? 1 : 0);

  if (countA < MIN_PLAYERS_PER_TEAM) {
    blockingErrors.push(`Team A tiene solo ${countA} jugador(es); mínimo ${MIN_PLAYERS_PER_TEAM}.`);
  }
  if (countB < MIN_PLAYERS_PER_TEAM) {
    blockingErrors.push(`Team B tiene solo ${countB} jugador(es); mínimo ${MIN_PLAYERS_PER_TEAM}.`);
  }

  if (!draft.A.goalkeeperPlayerId) warnings.push("Team A sin arquero asignado.");
  if (!draft.B.goalkeeperPlayerId) warnings.push("Team B sin arquero asignado.");

  const { total: scoreA, missing: missingA } = sumScores(
    draft.A.playerIds,
    draft.A.goalkeeperPlayerId,
    byId,
  );
  const { total: scoreB, missing: missingB } = sumScores(
    draft.B.playerIds,
    draft.B.goalkeeperPlayerId,
    byId,
  );

  if (missingA.length > 0 || missingB.length > 0) {
    blockingErrors.push("Hay jugadores en el draft que ya no están convocados. Regenerá el draft.");
  }

  const diff = Math.abs(scoreA - scoreB);
  if (diff > 2) {
    warnings.push(`Diferencia de score elevada (${diff.toFixed(2)}).`);
  }

  if (Math.abs(countA - countB) > 1) {
    warnings.push(`Diferencia de cantidad entre teams (${Math.abs(countA - countB)}).`);
  }

  return { warnings, blockingErrors };
}

/**
 * Confirma el match a partir del team_draft persistido. Atomico via
 * "creo matches, si algo falla despues lo borro" (cascade delete limpia
 * match_teams y match_team_players).
 */
export async function confirmMatch(
  _prev: ConfirmMatchState,
  formData: FormData,
): Promise<ConfirmMatchState> {
  const ctx = await requireRole("admin");

  const convocatoriaId = String(formData.get("convocatoria_id") ?? "").trim();
  if (!convocatoriaId) return { error: "Falta el id de la convocatoria." };

  const forceWithWarnings = formData.get("force_with_warnings") === "1";

  const supabase = await createClient();

  // Cargar convocatoria + draft.
  const { data: conv, error: convErr } = await supabase
    .from("convocatorias")
    .select("id, fecha, status, team_draft")
    .eq("id", convocatoriaId)
    .maybeSingle();

  if (convErr || !conv) return { error: "Convocatoria no encontrada." };
  if (conv.status !== "abierta") {
    return { error: "Solo se puede confirmar una convocatoria abierta." };
  }

  const draft = parseTeamDraft(conv.team_draft);
  if (!draft) return { error: "No hay draft cargado. Generá uno primero." };

  // Cargar info de los convocados (player_id que estan en el draft).
  const { data: convocados, error: convocadosErr } = await supabase
    .from("convocatoria_players")
    .select(`player:players!player_id(id, nombre, role_field, position_pref, internal_score)`)
    .eq("convocatoria_id", convocatoriaId);

  if (convocadosErr) return { error: `No se pudieron leer convocados: ${convocadosErr.message}` };

  const byId = new Map<string, PlayerCore>();
  for (const cp of convocados ?? []) {
    const p = cp.player;
    if (p && p.internal_score !== null) {
      byId.set(p.id, {
        id: p.id,
        nombre: p.nombre,
        role_field: p.role_field,
        position_pref: p.position_pref,
        internal_score: Number(p.internal_score),
      });
    }
  }

  const { warnings, blockingErrors } = checkWarnings(draft, byId);

  if (blockingErrors.length > 0) {
    return { error: blockingErrors.join(" · ") };
  }

  if (warnings.length > 0 && !forceWithWarnings) {
    return { warnings };
  }

  const confirmedWithWarning = warnings.length > 0;
  const snapshot = buildBalanceSnapshot(draft, byId, warnings, confirmedWithWarning);

  // 1. INSERT matches.
  const { data: matchRow, error: matchErr } = await supabase
    .from("matches")
    .insert({
      convocatoria_id: conv.id,
      fecha: conv.fecha,
      algorithm_version: ALGORITHM_VERSION,
      balance_snapshot: snapshot,
      confirmed_with_warning: confirmedWithWarning,
      confirmed_by: ctx.userId,
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (matchErr || !matchRow) {
    return { error: `No se pudo crear el match: ${matchErr?.message ?? "sin detalle"}` };
  }
  const matchId = matchRow.id;

  // Helper de rollback: matches tiene DELETE bloqueado por RLS, asi que
  // llamamos a la SECURITY DEFINER confirm_match_cleanup que permite borrar
  // SOLO si la convocatoria asociada sigue 'abierta' (escenario unico de
  // orphan). Ver migracion 20260524110000_confirm_match_cleanup.
  const rollback = async (reason: string): Promise<ConfirmMatchState> => {
    await supabase.rpc("confirm_match_cleanup", { p_match_id: matchId });
    return { error: `No se pudo confirmar: ${reason}` };
  };

  // 2. INSERT match_teams (A y B).
  const { totalA, totalB } = (() => {
    const a = sumScores(draft.A.playerIds, draft.A.goalkeeperPlayerId, byId).total;
    const b = sumScores(draft.B.playerIds, draft.B.goalkeeperPlayerId, byId).total;
    return { totalA: a, totalB: b };
  })();

  const { data: teamRows, error: teamErr } = await supabase
    .from("match_teams")
    .insert([
      {
        match_id: matchId,
        team_label: "A",
        total_score: totalA,
        balance_meta: { position_distribution: positionDist(draft.A.playerIds, byId) } as Json,
      },
      {
        match_id: matchId,
        team_label: "B",
        total_score: totalB,
        balance_meta: { position_distribution: positionDist(draft.B.playerIds, byId) } as Json,
      },
    ])
    .select("id, team_label");

  if (teamErr || !teamRows || teamRows.length !== 2) {
    return rollback(`crear match_teams (${teamErr?.message ?? "rows incompletas"})`);
  }

  const teamIdByLabel = new Map<"A" | "B", string>();
  for (const r of teamRows) teamIdByLabel.set(r.team_label as "A" | "B", r.id);

  const teamIdA = teamIdByLabel.get("A");
  const teamIdB = teamIdByLabel.get("B");
  if (!teamIdA || !teamIdB) return rollback("match_teams sin label A/B");

  // 3. INSERT match_team_players.
  type MTPInsert = {
    match_team_id: string;
    player_id: string;
    is_goalkeeper: boolean;
    assigned_position: PlayerCore["position_pref"] | null;
  };
  const inserts: MTPInsert[] = [];

  if (draft.A.goalkeeperPlayerId) {
    inserts.push({
      match_team_id: teamIdA,
      player_id: draft.A.goalkeeperPlayerId,
      is_goalkeeper: true,
      assigned_position: byId.get(draft.A.goalkeeperPlayerId)?.position_pref ?? null,
    });
  }
  for (const id of draft.A.playerIds) {
    inserts.push({
      match_team_id: teamIdA,
      player_id: id,
      is_goalkeeper: false,
      assigned_position: byId.get(id)?.position_pref ?? null,
    });
  }
  if (draft.B.goalkeeperPlayerId) {
    inserts.push({
      match_team_id: teamIdB,
      player_id: draft.B.goalkeeperPlayerId,
      is_goalkeeper: true,
      assigned_position: byId.get(draft.B.goalkeeperPlayerId)?.position_pref ?? null,
    });
  }
  for (const id of draft.B.playerIds) {
    inserts.push({
      match_team_id: teamIdB,
      player_id: id,
      is_goalkeeper: false,
      assigned_position: byId.get(id)?.position_pref ?? null,
    });
  }

  const { error: mtpErr } = await supabase.from("match_team_players").insert(inserts);
  if (mtpErr) return rollback(`crear match_team_players (${mtpErr.message})`);

  // 4. UPDATE convocatorias.status -> cerrada (manten el draft como referencia
  // historica; balance_snapshot es la fuente de verdad de aca en adelante).
  const { error: updErr } = await supabase
    .from("convocatorias")
    .update({ status: "cerrada" })
    .eq("id", conv.id);

  if (updErr) return rollback(`actualizar status (${updErr.message})`);

  revalidatePath(`/convocatorias/${conv.id}`);
  revalidatePath("/convocatorias");
  redirect(`/convocatorias/${conv.id}?confirmed=1`);
}
