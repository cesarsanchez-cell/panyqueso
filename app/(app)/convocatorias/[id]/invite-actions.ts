"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type CreateInvitationState = null | { error: string } | { success: string; token: string };

const E164_REGEX = /^\+[1-9]\d{6,14}$/;
const MAX_DAYS_VALID = 30;
const CUTOFF_HOURS = 8;

function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, "");
}

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

// Construye el partido datetime asumiendo hora local Argentina (UTC-3).
function partidoDateTimeArg(fecha: string, hora: string): Date {
  const horaTrimmed = hora.slice(0, 5);
  return new Date(`${fecha}T${horaTrimmed}:00-03:00`);
}

function computeExpiresAt(partido: Date): Date {
  const cutoff = new Date(partido.getTime() - CUTOFF_HOURS * 60 * 60 * 1000);
  const maxDefault = new Date(Date.now() + MAX_DAYS_VALID * 24 * 60 * 60 * 1000);
  return cutoff.getTime() < maxDefault.getTime() ? cutoff : maxDefault;
}

export async function createInvitation(
  _prev: CreateInvitationState,
  formData: FormData,
): Promise<CreateInvitationState> {
  const ctx = await requireRole("admin");

  const convocatoriaId = String(formData.get("convocatoria_id") ?? "").trim();
  if (!convocatoriaId) return { error: "Falta el id de la convocatoria." };

  const phoneRaw = String(formData.get("phone") ?? "").trim();
  if (!phoneRaw) return { error: "El teléfono es obligatorio." };
  const phone = normalizePhone(phoneRaw);
  if (!E164_REGEX.test(phone)) {
    return { error: "Teléfono inválido. Debe estar en formato E.164 (ej: +5491155551234)." };
  }

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { error: "El nombre es obligatorio." };
  if (nombre.length > 80) return { error: "Nombre demasiado largo (máx 80 caracteres)." };

  const supabase = await createClient();

  const { data: convocatoria, error: convErr } = await supabase
    .from("convocatorias")
    .select("id, status, fecha, hora, grupo_id")
    .eq("id", convocatoriaId)
    .maybeSingle();

  if (convErr) return { error: `No se pudo cargar la convocatoria: ${convErr.message}` };
  if (!convocatoria) return { error: "La convocatoria no existe." };
  if (convocatoria.status !== "abierta") {
    return { error: "Solo se puede invitar en convocatorias abiertas." };
  }
  if (!convocatoria.grupo_id) {
    return {
      error: "Esta convocatoria no está asociada a un grupo. No se pueden generar invites.",
    };
  }

  const partidoDateTime = partidoDateTimeArg(convocatoria.fecha, convocatoria.hora);
  const cutoff = new Date(partidoDateTime.getTime() - CUTOFF_HOURS * 60 * 60 * 1000);
  if (cutoff.getTime() <= Date.now()) {
    return {
      error: "Pasaron las 8h previas al partido. Ya no se pueden generar invites self-service.",
    };
  }

  // Skip si phone ya esta en players.
  const { data: existingPlayer, error: playerErr } = await supabase
    .from("players")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (playerErr) return { error: `No se pudo verificar jugadores: ${playerErr.message}` };
  if (existingPlayer) {
    return {
      error:
        "Ya hay un jugador registrado con ese teléfono. Agregalo manualmente desde el selector.",
    };
  }

  // Skip si ya hay invite pending para ese phone en esta convocatoria.
  const nowIso = new Date().toISOString();
  const { data: pendingSame, error: pendingErr } = await supabase
    .from("player_invitations")
    .select("id, token")
    .eq("convocatoria_id", convocatoriaId)
    .eq("phone", phone)
    .is("used_at", null)
    .is("declined_at", null)
    .gt("expires_at", nowIso)
    .maybeSingle();
  if (pendingErr) return { error: `No se pudo verificar invitaciones: ${pendingErr.message}` };
  if (pendingSame) {
    return { error: "Ya existe una invitación pendiente para ese teléfono en esta convocatoria." };
  }

  const expiresAt = computeExpiresAt(partidoDateTime);
  const token = generateToken();

  const { error: insertErr } = await supabase.from("player_invitations").insert({
    token,
    phone,
    nombre_tentativo: nombre,
    grupo_id: convocatoria.grupo_id,
    convocatoria_id: convocatoriaId,
    created_by: ctx.userId,
    expires_at: expiresAt.toISOString(),
  });

  if (insertErr) {
    return { error: `No se pudo crear la invitación: ${insertErr.message}` };
  }

  revalidatePath(`/convocatorias/${convocatoriaId}`);
  revalidatePath(`/grupos/${convocatoria.grupo_id}`);

  return { success: "Invitación creada.", token };
}

export async function cancelConvocatoriaInvitation(formData: FormData): Promise<void> {
  await requireRole("admin");

  const invitation_id = String(formData.get("invitation_id") ?? "").trim();
  if (!invitation_id) return;

  const supabase = await createClient();

  const { data: inv } = await supabase
    .from("player_invitations")
    .select("id, grupo_id, convocatoria_id, used_at, declined_at")
    .eq("id", invitation_id)
    .maybeSingle();

  if (!inv) return;
  if (inv.used_at !== null || inv.declined_at !== null) return;

  await supabase
    .from("player_invitations")
    .update({ expires_at: new Date().toISOString() })
    .eq("id", invitation_id);

  if (inv.convocatoria_id) revalidatePath(`/convocatorias/${inv.convocatoria_id}`);
  revalidatePath(`/grupos/${inv.grupo_id}`);
}
