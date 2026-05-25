"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/require-role";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type ChangeRequestInsert = Database["public"]["Tables"]["player_change_requests"]["Insert"];
type PiernaHabil = Database["public"]["Enums"]["pierna_habil_enum"];

export type StatusChangeAction = "deactivate_player" | "reactivate_player";

export type StatusChangeState = null | { error: string };

export type PrivateNotesState = null | { error: string } | { success: string };

export type ContactFieldsState = null | { error: string } | { success: string };

const E164_REGEX = /^\+[1-9]\d{6,14}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const PIERNA_VALUES: readonly PiernaHabil[] = ["derecha", "izquierda", "ambas"] as const;

function normalizePhoneInput(raw: string): string {
  return raw.replace(/[\s\-().]/g, "");
}

function parsePierna(raw: string): PiernaHabil | null | undefined {
  if (!raw) return null;
  return PIERNA_VALUES.includes(raw as PiernaHabil) ? (raw as PiernaHabil) : undefined;
}

function parseAction(raw: FormDataEntryValue | null): StatusChangeAction | null {
  if (raw === "deactivate_player" || raw === "reactivate_player") return raw;
  return null;
}

export async function requestStatusChange(
  _prev: StatusChangeState,
  formData: FormData,
): Promise<StatusChangeState> {
  const ctx = await requireRole("admin");

  const playerId = String(formData.get("player_id") ?? "").trim();
  if (!playerId) return { error: "Falta el id del jugador." };

  const action = parseAction(formData.get("action_type"));
  if (!action) return { error: "Acción inválida." };

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Motivo obligatorio." };

  const insertRow: ChangeRequestInsert = {
    action_type: action,
    player_id: playerId,
    requested_by: ctx.userId,
    proposed_values: {},
    reason,
  };

  const supabase = await createClient();

  // Bloquear duplicacion: una sola solicitud activa del mismo action_type
  // por jugador (deactivate y reactivate son acciones distintas, no se
  // bloquean entre si — el flujo natural es approve uno y proponer el otro).
  const { data: openSame, error: openErr } = await supabase
    .from("player_change_requests")
    .select("id")
    .eq("player_id", playerId)
    .eq("action_type", action)
    .in("status", ["pending", "flagged"])
    .limit(1)
    .maybeSingle();

  if (openErr) {
    return { error: `No se pudo verificar duplicados: ${openErr.message}` };
  }
  if (openSame) {
    const label = action === "deactivate_player" ? "desactivación" : "reactivación";
    return {
      error: `Ya hay una solicitud de ${label} pendiente para este jugador.`,
    };
  }

  const { error } = await supabase.from("player_change_requests").insert(insertRow);

  if (error) {
    return { error: `No se pudo crear la solicitud: ${error.message}` };
  }

  revalidatePath(`/jugadores/${playerId}`);
  revalidatePath("/auditoria");

  const flashKey = action === "deactivate_player" ? "deactivate=1" : "reactivate=1";
  redirect(`/jugadores/${playerId}?${flashKey}`);
}

export async function updateContactFields(
  _prev: ContactFieldsState,
  formData: FormData,
): Promise<ContactFieldsState> {
  await requireRole("admin");

  const playerId = String(formData.get("player_id") ?? "").trim();
  if (!playerId) return { error: "Falta el id del jugador." };

  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim();
  const apodoRaw = String(formData.get("apodo") ?? "").trim();
  const piernaRaw = String(formData.get("pierna_habil") ?? "").trim();
  const fechaRaw = String(formData.get("fecha_nacimiento") ?? "").trim();

  let phone: string | null = null;
  if (phoneRaw) {
    const normalized = normalizePhoneInput(phoneRaw);
    if (!E164_REGEX.test(normalized)) {
      return {
        error: "Teléfono inválido. Debe estar en formato E.164 (ej: +5491155551234).",
      };
    }
    phone = normalized;
  }

  let email: string | null = null;
  if (emailRaw) {
    if (!EMAIL_REGEX.test(emailRaw) || emailRaw.length > 254) {
      return { error: "Email inválido." };
    }
    email = emailRaw.toLowerCase();
  }

  let apodo: string | null = null;
  if (apodoRaw) {
    if (apodoRaw.length > 40) return { error: "Apodo demasiado largo (máx 40 caracteres)." };
    apodo = apodoRaw;
  }

  const pierna = parsePierna(piernaRaw);
  if (pierna === undefined) return { error: "Pierna hábil inválida." };

  let fecha_nacimiento: string | null = null;
  if (fechaRaw) {
    if (!FECHA_REGEX.test(fechaRaw)) {
      return { error: "Fecha de nacimiento inválida (formato YYYY-MM-DD)." };
    }
    const parsed = new Date(`${fechaRaw}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
      return { error: "Fecha de nacimiento inválida." };
    }
    fecha_nacimiento = fechaRaw;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("players")
    .update({ phone, email, apodo, pierna_habil: pierna, fecha_nacimiento })
    .eq("id", playerId);

  if (error) {
    if (error.code === "23505") {
      const detail = error.message.toLowerCase();
      if (detail.includes("phone")) {
        return { error: "Ese teléfono ya está asignado a otro jugador." };
      }
      if (detail.includes("email")) {
        return { error: "Ese email ya está asignado a otro jugador." };
      }
      return { error: "Conflicto de unicidad. Revisá teléfono y email." };
    }
    return { error: `No se pudo guardar: ${error.message}` };
  }

  revalidatePath(`/jugadores/${playerId}`);
  return { success: "Datos guardados." };
}

export async function updatePrivateNotes(
  _prev: PrivateNotesState,
  formData: FormData,
): Promise<PrivateNotesState> {
  await requireRole("admin");

  const playerId = String(formData.get("player_id") ?? "").trim();
  if (!playerId) return { error: "Falta el id del jugador." };

  // private_notes vacio se interpreta como "borrar las notas" (NULL).
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
