"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
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

  // Leemos el estado actual ANTES del UPDATE: necesitamos auth_user_id para
  // poder sincronizar el auth.email sintetico cuando cambia el celular.
  const { data: existing, error: readErr } = await supabase
    .from("players")
    .select("phone, auth_user_id")
    .eq("id", playerId)
    .maybeSingle();

  if (readErr) return { error: `No se pudo leer el jugador: ${readErr.message}` };
  if (!existing) return { error: "El jugador no existe." };

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

  // Sincronizar auth.email del jugador con su celular actual.
  //
  // El email sintetico de auth (`<phone>@phone.fdlm.local`) tiene que coincidir
  // exacto con players.phone porque el login traduce celular -> email para
  // pegarle a Supabase Auth. Si quedan desync, el jugador no puede loguear.
  //
  // Detectamos drift comparando lo que tiene auth con el sintetico esperado
  // del nuevo phone, no comparando con el phone viejo. Asi cubrimos tambien
  // el caso retroactivo donde players.phone y auth.email ya estaban desync
  // por bugs previos: el proximo save los re-alinea.
  if (existing.auth_user_id && phone) {
    const expectedAuthEmail = `${phone.toLowerCase()}@phone.fdlm.local`;
    const admin = createAdminClient();
    const { data: authUser, error: getErr } = await admin.auth.admin.getUserById(
      existing.auth_user_id,
    );

    if (getErr) {
      return {
        error: `Datos guardados, pero no pude leer la cuenta de auth: ${getErr.message}. El jugador podria no poder loguear con el nuevo celular.`,
      };
    }

    const currentAuthEmail = authUser?.user?.email ?? null;
    if (currentAuthEmail !== expectedAuthEmail) {
      const { error: authErr } = await admin.auth.admin.updateUserById(existing.auth_user_id, {
        email: expectedAuthEmail,
      });

      if (authErr) {
        // Rollback best-effort del phone en players para no quedar desync.
        if (existing.phone !== phone) {
          await supabase.from("players").update({ phone: existing.phone }).eq("id", playerId);
        }
        const detail = authErr.message.toLowerCase();
        if (detail.includes("already")) {
          return {
            error:
              "Ese teléfono ya está usado por otra cuenta de Supabase Auth. Revisá si hay un jugador duplicado.",
          };
        }
        return {
          error: `Se guardó pero no se pudo sincronizar la cuenta de auth: ${authErr.message}.`,
        };
      }
    }
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

// ============================================================================
// resetPlayerPassword: admin genera un password temporal para el jugador y se
// lo pasa por WhatsApp. Cubre el caso "me olvide la contraseña" para players
// que entran con celular (auth.email sintetico no recibe mails de Supabase).
//
// Devuelve el password en claro UNA SOLA VEZ en el state para que el admin lo
// copie. No queda persistido en ningun lado.
// ============================================================================

export type ResetPlayerPasswordState =
  | null
  | { error: string }
  | { tempPassword: string; phone: string | null };

function generateTempPassword(): string {
  // 12 chars base64url-ish (URL safe). 9 bytes -> 12 chars base64. Mas que
  // suficiente para un pass temporal de un solo uso.
  return randomBytes(9).toString("base64").replace(/\+/g, "A").replace(/\//g, "Z");
}

export async function resetPlayerPassword(
  _prev: ResetPlayerPasswordState,
  formData: FormData,
): Promise<ResetPlayerPasswordState> {
  await requireRole("admin");

  const playerId = String(formData.get("player_id") ?? "").trim();
  if (!playerId) return { error: "Falta el id del jugador." };

  const supabase = await createClient();
  const { data: player, error: playerErr } = await supabase
    .from("players")
    .select("auth_user_id, phone")
    .eq("id", playerId)
    .maybeSingle();

  if (playerErr) return { error: `No se pudo leer el jugador: ${playerErr.message}` };
  if (!player) return { error: "El jugador no existe." };
  if (!player.auth_user_id) {
    return {
      error:
        "Este jugador todavía no completó su alta (no tiene cuenta). No hay password que resetear.",
    };
  }

  const tempPassword = generateTempPassword();
  const admin = createAdminClient();
  const { error: updateErr } = await admin.auth.admin.updateUserById(player.auth_user_id, {
    password: tempPassword,
  });

  if (updateErr) {
    return { error: `No se pudo resetear el password: ${updateErr.message}` };
  }

  return { tempPassword, phone: player.phone };
}
