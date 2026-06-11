"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/require-role";
import { findUnplayedPreviousConvocatoria } from "@/lib/convocatorias/previous-played-gate";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import {
  ALGORITHM_VERSION,
  buildBalanceSnapshot,
  checkWarnings,
  type PlayerCore,
  positionDist,
  sumScores,
} from "@/lib/teams/confirm";
import { parseTeamDraft } from "@/lib/teams/draft";
import { loadGroupRatings } from "@/lib/teams/group-ratings";

export type ConfirmMatchState = null | { error: string } | { warnings: string[] };

// "YYYY-MM-DD" -> "DD/MM/YYYY" para los mensajes al admin.
function fmtFechaCorta(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
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
    .select("id, fecha, status, team_draft, grupo_id")
    .eq("id", convocatoriaId)
    .maybeSingle();

  if (convErr || !conv) return { error: "Convocatoria no encontrada." };
  if (conv.status !== "abierta") {
    return { error: "Solo se puede confirmar una convocatoria abierta." };
  }

  // Regla de secuencia: no cerrar esta si hay una anterior del mismo grupo sin
  // jugar. Primero hay que cargar el resultado del partido viejo.
  const blocking = await findUnplayedPreviousConvocatoria(supabase, convocatoriaId);
  if (blocking) {
    return {
      error: `No podés cerrar esta convocatoria todavía: primero jugá y cargá el resultado de la del ${fmtFechaCorta(blocking.fecha)} (mismo grupo).`,
    };
  }

  const draft = parseTeamDraft(conv.team_draft);
  if (!draft) return { error: "No hay draft cargado. Generá uno primero." };

  // Cargar SOLO los titulares no-declinados actuales (mismo filtro que el
  // generador en draft-actions). Asi, si despues de generar el draft un titular
  // se baja (la DB lo marca declinado y promueve un suplente), el draft queda
  // viejo: el jugador bajado ya no entra en byId y checkWarnings lo detecta
  // como "ya no convocado", bloqueando la confirmacion hasta regenerar.
  const { data: convocados, error: convocadosErr } = await supabase
    .from("convocatoria_players")
    .select(`player:players!player_id(id, nombre, role_field, position_pref, internal_score)`)
    .eq("convocatoria_id", convocatoriaId)
    .eq("rol_en_convocatoria", "titular")
    .neq("attendance_status", "declinado");

  if (convocadosErr) return { error: `No se pudieron leer convocados: ${convocadosErr.message}` };

  // FUT-103/105: si la convocatoria es de un grupo, el snapshot usa el rating
  // POR GRUPO (mismo override que la generación y el display), para que lo que se
  // guarda coincida con lo que se vio y se armó.
  const playerIds = (convocados ?? [])
    .map((cp) => cp.player?.id)
    .filter((id): id is string => Boolean(id));
  const overrides = await loadGroupRatings(supabase, conv.grupo_id, playerIds);

  const byId = new Map<string, PlayerCore>();
  for (const cp of convocados ?? []) {
    const p = cp.player;
    if (p && p.internal_score !== null) {
      const g = overrides.get(p.id);
      byId.set(p.id, {
        id: p.id,
        nombre: p.nombre,
        role_field: g?.role_field ?? p.role_field,
        position_pref: g?.position_pref ?? p.position_pref,
        internal_score: g ? g.internal_score : Number(p.internal_score),
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
    // 23505 = unique violation. La unique(convocatoria_id) en matches
    // (Fase 6 self-audit hotfix) previene race conditions: si otro admin
    // ya confirmo esta convocatoria, el segundo intento cae aca.
    if (matchErr?.code === "23505") {
      return {
        error:
          "Ya existe un partido confirmado para esta convocatoria. Refrescá la página para verlo.",
      };
    }
    return { error: `No se pudo crear el match: ${matchErr?.message ?? "sin detalle"}` };
  }
  const matchId = matchRow.id;

  // Helper de rollback: matches tiene DELETE bloqueado por RLS, asi que
  // llamamos a la SECURITY DEFINER confirm_match_cleanup que permite borrar
  // SOLO si la convocatoria asociada sigue 'abierta' (escenario unico de
  // orphan). Ver migracion 20260524110000_confirm_match_cleanup.
  const rollback = async (reason: string): Promise<ConfirmMatchState> => {
    const { error: cleanupErr } = await supabase.rpc("confirm_match_cleanup", {
      p_match_id: matchId,
    });
    if (cleanupErr) {
      // El rollback fallo despues de que el match ya estaba creado. Logueamos
      // server-side para diagnostico y avisamos al user que hay un partido
      // huerfano para limpiar manualmente.
      console.error(
        `confirmMatch rollback failed for match_id=${matchId} (reason=${reason}):`,
        cleanupErr.message,
      );
      return {
        error: `No se pudo confirmar (${reason}) y no se pudo deshacer automaticamente. Avisá al admin de la base: hay un partido huerfano con id ${matchId}.`,
      };
    }
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

  // Bug 4: auto-crear la proxima convocatoria heredando el roster. Best-effort:
  // el match ya esta confirmado (lo critico); si la auto-renovacion falla solo
  // logueamos y seguimos. El admin siempre puede crearla manualmente despues.
  // create_next_convocatoria es no-op si el grupo no auto-renueva o no hay grupo.
  const { error: nextErr } = await supabase.rpc("create_next_convocatoria", {
    p_source_conv_id: conv.id,
  });
  if (nextErr) {
    console.error(
      `confirmMatch: no se pudo auto-crear la proxima convocatoria (conv=${conv.id}):`,
      nextErr.message,
    );
  }

  revalidatePath(`/convocatorias/${conv.id}`);
  revalidatePath("/convocatorias");
  redirect(`/convocatorias/${conv.id}?confirmed=1`);
}
