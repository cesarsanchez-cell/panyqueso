"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/require-role";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type ChangeRequestInsert = Database["public"]["Tables"]["player_change_requests"]["Insert"];
type PlayerRoleField = Database["public"]["Enums"]["player_role_field"];
type PositionPref = Database["public"]["Enums"]["position_pref"];
type RatingConfidence = Database["public"]["Enums"]["rating_confidence"];

export type NewPlayerState = null | { error: string } | { fieldErrors: Record<string, string> };

const ROLES: readonly PlayerRoleField[] = ["arquero", "jugador_campo", "mixto"];
const POSITIONS: readonly PositionPref[] = ["arquero", "defensor", "mediocampista", "delantero"];
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

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function parseFechaNacimiento(v: FormDataEntryValue | null): {
  fecha: string;
  edad: number;
} | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!FECHA_REGEX.test(trimmed)) return null;

  const dob = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;

  const now = new Date();
  let edad = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    edad--;
  }
  if (edad < 14 || edad > 99) return null;

  return { fecha: trimmed, edad };
}

export async function createPlayerRequest(
  _prev: NewPlayerState,
  formData: FormData,
): Promise<NewPlayerState> {
  const ctx = await requireRole("admin");

  const errors: Record<string, string> = {};

  const nombre = asString(formData.get("nombre"));
  if (!nombre) errors.nombre = "Ingresá un nombre";

  const dobParsed = parseFechaNacimiento(formData.get("fecha_nacimiento"));
  if (dobParsed === null) {
    errors.fecha_nacimiento = "Fecha de nacimiento inválida (edad debe estar entre 14 y 99)";
  }

  const role_field_raw = asString(formData.get("role_field"));
  const role_field = ROLES.includes(role_field_raw as PlayerRoleField)
    ? (role_field_raw as PlayerRoleField)
    : null;
  if (!role_field) errors.role_field = "Elegí un rol";

  const position_pref_raw = asString(formData.get("position_pref"));
  const position_pref = POSITIONS.includes(position_pref_raw as PositionPref)
    ? (position_pref_raw as PositionPref)
    : null;
  if (!position_pref) errors.position_pref = "Elegí una posición";

  const positions_possible = formData
    .getAll("positions_possible")
    .filter((v): v is string => typeof v === "string")
    .filter((v): v is PositionPref => POSITIONS.includes(v as PositionPref));

  const technical = parseRating(formData.get("technical"));
  if (technical === null) errors.technical = "Entre 1 y 10";
  const physical = parseRating(formData.get("physical"));
  if (physical === null) errors.physical = "Entre 1 y 10";
  const mental = parseRating(formData.get("mental"));
  if (mental === null) errors.mental = "Entre 1 y 10";

  const rating_confidence_raw = asString(formData.get("rating_confidence")) || "baja";
  const rating_confidence = CONFIDENCES.includes(rating_confidence_raw as RatingConfidence)
    ? (rating_confidence_raw as RatingConfidence)
    : null;
  if (!rating_confidence) errors.rating_confidence = "Elegí una confianza";

  const private_notes = asString(formData.get("private_notes"));

  const reason = asString(formData.get("reason"));
  if (!reason) errors.reason = "Explicá por qué se da de alta este jugador";

  if (Object.keys(errors).length > 0) {
    return { fieldErrors: errors };
  }

  // dobParsed siempre esta poblado aca (se valido arriba). El non-null assert
  // es seguro porque si era null ya retornamos con errors.
  const { fecha: fecha_nacimiento, edad } = dobParsed!;

  // Build proposed_values jsonb con los campos finales (sin nulls).
  // edad va derivada (compute_internal_score la sigue usando); fecha_nacimiento
  // queda guardada para futuras pantallas.
  const proposed_values: { [key: string]: Json } = {
    nombre,
    edad,
    fecha_nacimiento,
    role_field,
    position_pref,
    technical,
    physical,
    mental,
    rating_confidence,
  };
  if (positions_possible.length > 0) {
    proposed_values.positions_possible = positions_possible;
  }
  if (private_notes) {
    proposed_values.private_notes = private_notes;
  }

  const insertRow: ChangeRequestInsert = {
    action_type: "create_player",
    requested_by: ctx.userId,
    proposed_values,
    reason,
  };

  const supabase = await createClient();
  const { error } = await supabase.from("player_change_requests").insert(insertRow);

  if (error) {
    return { error: `No se pudo crear la solicitud: ${error.message}` };
  }

  revalidatePath("/jugadores");
  redirect("/jugadores?created=1");
}
