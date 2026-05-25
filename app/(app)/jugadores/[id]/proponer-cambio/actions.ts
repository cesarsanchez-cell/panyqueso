"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/require-role";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type ChangeRequestInsert = Database["public"]["Tables"]["player_change_requests"]["Insert"];
type RatingConfidence = Database["public"]["Enums"]["rating_confidence"];

export type ProposeChangeState = null | { error: string } | { fieldErrors: Record<string, string> };

const CONFIDENCES: readonly RatingConfidence[] = ["baja", "media", "alta"];

function asString(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

function parseRating(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 10) return null;
  return n;
}

export async function proposeChange(
  playerId: string,
  _prev: ProposeChangeState,
  formData: FormData,
): Promise<ProposeChangeState> {
  const ctx = await requireRole("admin");

  if (!playerId) return { error: "Falta el id del jugador." };

  const errors: Record<string, string> = {};

  const technical = parseRating(formData.get("technical"));
  if (technical === null) errors.technical = "Entre 1 y 10";
  const physical = parseRating(formData.get("physical"));
  if (physical === null) errors.physical = "Entre 1 y 10";
  const mental = parseRating(formData.get("mental"));
  if (mental === null) errors.mental = "Entre 1 y 10";

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
    .select("id, technical, physical, mental, rating_confidence")
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

  // Calcular delta. Solo los campos que cambian van a proposed_values + old_values.
  const proposed_values: { [k: string]: Json } = {};
  const old_values: { [k: string]: Json } = {};
  const fields_changed: string[] = [];

  const compare = <T extends Json>(key: string, oldVal: T, newVal: T) => {
    if (oldVal !== newVal) {
      proposed_values[key] = newVal;
      old_values[key] = oldVal;
      fields_changed.push(key);
    }
  };

  compare("technical", player.technical, technical);
  compare("physical", player.physical, physical);
  compare("mental", player.mental, mental);
  compare("rating_confidence", player.rating_confidence, rating_confidence);

  if (fields_changed.length === 0) {
    return { error: "No detectamos cambios. Modificá al menos un campo." };
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

  const { error } = await supabase.from("player_change_requests").insert(insertRow);

  if (error) {
    return { error: `No se pudo crear la solicitud: ${error.message}` };
  }

  revalidatePath(`/jugadores/${playerId}`);
  revalidatePath("/auditoria");
  redirect(`/jugadores/${playerId}?proposed=1`);
}
