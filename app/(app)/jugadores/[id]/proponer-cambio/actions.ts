"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/require-role";
import { applyDirectIfGateOff } from "@/lib/players/veedor-gate";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type ChangeRequestInsert = Database["public"]["Tables"]["player_change_requests"]["Insert"];
type RatingConfidence = Database["public"]["Enums"]["rating_confidence"];

export type ProposeChangeState = null | { error: string } | { fieldErrors: Record<string, string> };

const CONFIDENCES: readonly RatingConfidence[] = ["baja", "media", "alta"];

// Subcomponentes por dimensión (modelo de puntuación v2). La dimensión
// técnica/físico/mental es el promedio redondeado de sus 3 subs.
const SUBS = {
  physical: ["phys_power", "phys_speed", "phys_stamina"],
  mental: ["ment_tactical", "ment_resilience", "ment_attitude"],
  technical: ["tech_passing", "tech_finishing", "tech_linkup"],
} as const;

const SUB_KEYS = [...SUBS.physical, ...SUBS.mental, ...SUBS.technical] as const;
type SubKey = (typeof SUB_KEYS)[number];
type DimKey = keyof typeof SUBS;

function asString(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

function parseRating(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 10) return null;
  return n;
}

function avgRound(a: number, b: number, c: number): number {
  return Math.round((a + b + c) / 3);
}

export async function proposeChange(
  playerId: string,
  _prev: ProposeChangeState,
  formData: FormData,
): Promise<ProposeChangeState> {
  const ctx = await requireRole("admin");

  if (!playerId) return { error: "Falta el id del jugador." };

  const errors: Record<string, string> = {};

  // Parsear los 9 subcomponentes (1–10).
  const subs = {} as Record<SubKey, number>;
  for (const key of SUB_KEYS) {
    const val = parseRating(formData.get(key));
    if (val === null) errors[key] = "Entre 1 y 10";
    else subs[key] = val;
  }

  const rating_confidence_raw = asString(formData.get("rating_confidence"));
  const rating_confidence = CONFIDENCES.includes(rating_confidence_raw as RatingConfidence)
    ? (rating_confidence_raw as RatingConfidence)
    : null;
  if (!rating_confidence) errors.rating_confidence = "Elegí una confianza";

  const reason = asString(formData.get("reason"));
  if (!reason) errors.reason = "Explicá el motivo del cambio";

  if (Object.keys(errors).length > 0) {
    return { fieldErrors: errors };
  }

  // Leer el player actual para calcular delta vs lo propuesto.
  const supabase = await createClient();
  const { data: player, error: playerErr } = await supabase
    .from("players")
    .select(
      "id, technical, physical, mental, rating_confidence, phys_power, phys_speed, phys_stamina, ment_tactical, ment_resilience, ment_attitude, tech_passing, tech_finishing, tech_linkup",
    )
    .eq("id", playerId)
    .maybeSingle();

  if (playerErr) {
    return { error: `No se pudo leer el jugador: ${playerErr.message}` };
  }
  if (!player) {
    return { error: "El jugador no existe." };
  }

  // Bloquear duplicacion: solo permitimos una solicitud sensible activa por
  // jugador. RLS deja al admin ver solo las suyas, asi que si otro admin
  // propuso un cambio, este check no lo detecta — pero el veedor lo resuelve
  // y el segundo intento queda registrado igual. Aceptable para el MVP.
  const { data: openSensitive, error: openErr } = await supabase
    .from("player_change_requests")
    .select("id")
    .eq("player_id", playerId)
    .eq("action_type", "update_sensitive_fields")
    .in("status", ["pending", "flagged"])
    .limit(1)
    .maybeSingle();

  if (openErr) {
    return { error: `No se pudo verificar duplicados: ${openErr.message}` };
  }
  if (openSensitive) {
    return {
      error:
        "Ya hay una solicitud de cambio sensible pendiente para este jugador. Esperá la decisión del veedor antes de proponer otra.",
    };
  }

  // Calcular delta. Solo los campos que cambian van a proposed_values +
  // old_values. old_values guarda el valor ACTUAL real (los subs pueden estar
  // en null para jugadores que nunca se editaron) para que el staleness check
  // del approve no falle.
  const proposed_values: { [k: string]: Json } = {};
  const old_values: { [k: string]: Json } = {};
  const fields_changed: string[] = [];
  const touchedDims = new Set<DimKey>();

  for (const dim of Object.keys(SUBS) as DimKey[]) {
    for (const sub of SUBS[dim]) {
      const oldVal = player[sub] as number | null;
      const newVal = subs[sub];
      if (oldVal !== newVal) {
        proposed_values[sub] = newVal;
        old_values[sub] = oldVal;
        fields_changed.push(sub);
        touchedDims.add(dim);
      }
    }
  }

  // Por cada dimensión tocada, recalcular el promedio y mandar también la
  // dimensión (técnica/físico/mental) para que el trigger recalcule el score.
  for (const dim of touchedDims) {
    const [a, b, c] = SUBS[dim];
    const newDim = avgRound(subs[a], subs[b], subs[c]);
    proposed_values[dim] = newDim;
    old_values[dim] = player[dim];
    fields_changed.push(dim);
  }

  if (rating_confidence !== player.rating_confidence) {
    proposed_values.rating_confidence = rating_confidence;
    old_values.rating_confidence = player.rating_confidence;
    fields_changed.push("rating_confidence");
  }

  if (fields_changed.length === 0) {
    return { error: "No detectamos cambios. Modificá al menos un sub-rating." };
  }

  const insertRow: ChangeRequestInsert = {
    action_type: "update_sensitive_fields",
    player_id: playerId,
    requested_by: ctx.userId,
    proposed_values,
    old_values,
    fields_changed,
    reason,
  };

  const { data: inserted, error } = await supabase
    .from("player_change_requests")
    .insert(insertRow)
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: `No se pudo crear la solicitud: ${error?.message ?? "desconocido"}` };
  }

  // Veedor opcional: si el gate está apagado, el admin aplica el cambio directo
  // (manteniendo la traza: la solicitud queda 'approved' + audit_log). Si está
  // prendido, queda pendiente del veedor como hasta hoy.
  const { applied, error: applyError } = await applyDirectIfGateOff(supabase, inserted.id);
  if (applyError) {
    return {
      error: `Se creó la solicitud pero no se pudo aplicar directo: ${applyError}. Quedó pendiente para el veedor.`,
    };
  }

  revalidatePath(`/jugadores/${playerId}`);
  revalidatePath("/auditoria");
  redirect(`/jugadores/${playerId}?${applied ? "applied" : "proposed"}=1`);
}
