"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type PlayerRoleField = Database["public"]["Enums"]["player_role_field"];
type PositionPref = Database["public"]["Enums"]["position_pref"];
type PlayerStatus = Database["public"]["Enums"]["player_status"];
type PiernaHabil = Database["public"]["Enums"]["pierna_habil_enum"];

export type PrivateNotesState = null | { error: string } | { success: string };

export type UpdatePlayerState =
  | null
  | { error: string }
  | { fieldErrors: Record<string, string> }
  | { success: string };

const ROLES: readonly PlayerRoleField[] = ["arquero", "jugador_campo", "mixto"];
const POSITIONS: readonly PositionPref[] = ["arquero", "defensor", "mediocampista", "delantero"];
const ADMIN_STATUSES: readonly PlayerStatus[] = ["approved", "inactive"];
const PIERNA_VALUES: readonly PiernaHabil[] = ["derecha", "izquierda", "ambas"];

const E164_REGEX = /^\+[1-9]\d{6,14}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NOMBRE = 80;
const MAX_APODO = 40;

function normalizePhoneInput(raw: string): string {
  return raw.replace(/[\s\-().]/g, "");
}

function parseFechaNacimiento(raw: string): { fecha: string; edad: number } | null {
  if (!FECHA_REGEX.test(raw)) return null;
  const dob = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let edad = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) edad--;
  if (edad < 14 || edad > 99) return null;
  return { fecha: raw, edad };
}

// ============================================================================
// updatePlayerData: admin edita todos los campos no-rating del jugador en una
// sola operacion. Fase 9 PR B.
// Campos editables: nombre, fecha_nacimiento (+ edad derivada), role_field,
// position_pref, positions_possible, phone, email, apodo, pierna_habil, status.
// Ratings (technical/physical/mental/rating_confidence) NO se tocan aca; viven
// en proponer-cambio (audit gate).
// ============================================================================
export async function updatePlayerData(
  _prev: UpdatePlayerState,
  formData: FormData,
): Promise<UpdatePlayerState> {
  await requireRole("admin");

  const playerId = String(formData.get("player_id") ?? "").trim();
  if (!playerId) return { error: "Falta el id del jugador." };

  const errors: Record<string, string> = {};

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) errors.nombre = "Obligatorio.";
  else if (nombre.length > MAX_NOMBRE) errors.nombre = `Máximo ${MAX_NOMBRE} caracteres.`;

  const fechaRaw = String(formData.get("fecha_nacimiento") ?? "").trim();
  let fecha_nacimiento: string | null = null;
  let edad: number | null = null;
  if (fechaRaw) {
    const parsed = parseFechaNacimiento(fechaRaw);
    if (!parsed) errors.fecha_nacimiento = "Fecha inválida (edad debe quedar entre 14 y 99).";
    else {
      fecha_nacimiento = parsed.fecha;
      edad = parsed.edad;
    }
  } else {
    errors.fecha_nacimiento = "Obligatorio.";
  }

  const role_field_raw = String(formData.get("role_field") ?? "").trim();
  const role_field = ROLES.includes(role_field_raw as PlayerRoleField)
    ? (role_field_raw as PlayerRoleField)
    : null;
  if (!role_field) errors.role_field = "Elegí un rol.";

  const position_pref_raw = String(formData.get("position_pref") ?? "").trim();
  const position_pref = POSITIONS.includes(position_pref_raw as PositionPref)
    ? (position_pref_raw as PositionPref)
    : null;
  if (!position_pref) errors.position_pref = "Elegí una posición.";

  const positions_possible = formData
    .getAll("positions_possible")
    .filter((v): v is string => typeof v === "string")
    .filter((v): v is PositionPref => POSITIONS.includes(v as PositionPref));

  const phoneRaw = String(formData.get("phone") ?? "").trim();
  let phone: string | null = null;
  if (phoneRaw) {
    const normalized = normalizePhoneInput(phoneRaw);
    if (!E164_REGEX.test(normalized)) errors.phone = "Formato E.164 (+5491155551234).";
    else phone = normalized;
  }

  const emailRaw = String(formData.get("email") ?? "").trim();
  let email: string | null = null;
  if (emailRaw) {
    if (!EMAIL_REGEX.test(emailRaw) || emailRaw.length > 254) errors.email = "Email inválido.";
    else email = emailRaw.toLowerCase();
  }

  const apodoRaw = String(formData.get("apodo") ?? "").trim();
  let apodo: string | null = null;
  if (apodoRaw) {
    if (apodoRaw.length > MAX_APODO) errors.apodo = `Máximo ${MAX_APODO} caracteres.`;
    else apodo = apodoRaw;
  }

  const piernaRaw = String(formData.get("pierna_habil") ?? "").trim();
  let pierna_habil: PiernaHabil | null = null;
  if (piernaRaw) {
    if (!PIERNA_VALUES.includes(piernaRaw as PiernaHabil)) {
      errors.pierna_habil = "Valor inválido.";
    } else {
      pierna_habil = piernaRaw as PiernaHabil;
    }
  }

  const statusRaw = String(formData.get("status") ?? "").trim();
  const status = ADMIN_STATUSES.includes(statusRaw as PlayerStatus)
    ? (statusRaw as PlayerStatus)
    : null;
  if (!status) errors.status = "Elegí un estado.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  const supabase = await createClient();
  const { error } = await supabase
    .from("players")
    .update({
      nombre,
      fecha_nacimiento,
      edad: edad!,
      role_field: role_field!,
      position_pref: position_pref!,
      positions_possible,
      phone,
      email,
      apodo,
      pierna_habil,
      status: status!,
    })
    .eq("id", playerId);

  if (error) {
    if (error.code === "23505") {
      const detail = error.message.toLowerCase();
      if (detail.includes("phone"))
        return { error: "Ese teléfono ya está asignado a otro jugador." };
      if (detail.includes("email")) return { error: "Ese email ya está asignado a otro jugador." };
      return { error: "Conflicto de unicidad. Revisá teléfono y email." };
    }
    return { error: `No se pudo guardar: ${error.message}` };
  }

  revalidatePath(`/jugadores/${playerId}`);
  return { success: "Datos guardados." };
}

// ============================================================================
// updatePrivateNotes: admin-direct, sigue igual.
// ============================================================================
export async function updatePrivateNotes(
  _prev: PrivateNotesState,
  formData: FormData,
): Promise<PrivateNotesState> {
  await requireRole("admin");

  const playerId = String(formData.get("player_id") ?? "").trim();
  if (!playerId) return { error: "Falta el id del jugador." };

  const raw = String(formData.get("private_notes") ?? "").trim();
  const value = raw.length > 0 ? raw : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("players")
    .update({ private_notes: value })
    .eq("id", playerId);

  if (error) {
    return { error: `No se pudieron guardar las notas: ${error.message}` };
  }

  revalidatePath(`/jugadores/${playerId}`);
  return { success: "Notas guardadas." };
}
