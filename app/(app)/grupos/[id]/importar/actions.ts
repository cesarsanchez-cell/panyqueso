"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";

import { requireRole } from "@/lib/auth/require-role";
import { parseArPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

export type BulkImportEntry = {
  phone: string;
  nombre: string;
  link: string;
};

export type BulkImportSkipped = {
  linea: string;
  razon: string;
};

export type BulkImportState =
  | null
  | { error: string }
  | {
      aceptadas: BulkImportEntry[];
      salteadas: BulkImportSkipped[];
    };

const MAX_LINES = 200;
const DAYS_VALID = 30;

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

type ParsedLine =
  | { ok: true; phone: string; nombre: string; raw: string }
  | { ok: false; raw: string; razon: string };

function parseLine(raw: string): ParsedLine | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const commaIdx = trimmed.indexOf(",");
  if (commaIdx === -1) {
    return { ok: false, raw: trimmed, razon: "Falta la coma separando teléfono y nombre." };
  }

  const phoneRaw = trimmed.slice(0, commaIdx).trim();
  const nombre = trimmed.slice(commaIdx + 1).trim();

  if (!nombre) {
    return { ok: false, raw: trimmed, razon: "Nombre vacío." };
  }
  if (nombre.length > 80) {
    return { ok: false, raw: trimmed, razon: "Nombre demasiado largo (máx 80 caracteres)." };
  }

  const phone = parseArPhone(phoneRaw);
  if (!phone) {
    return {
      ok: false,
      raw: trimmed,
      razon: "Celular inválido. Ingresá los 10 dígitos (ej: 1155551234).",
    };
  }

  return { ok: true, phone, nombre, raw: trimmed };
}

export async function bulkCreateInvitations(
  _prev: BulkImportState,
  formData: FormData,
): Promise<BulkImportState> {
  const ctx = await requireRole(["admin", "coordinador"]);

  const grupoId = String(formData.get("grupo_id") ?? "").trim();
  if (!grupoId) return { error: "Falta el id del grupo." };

  const raw = String(formData.get("entries") ?? "");
  if (!raw.trim()) return { error: "Pegá al menos una línea con formato +telefono,Nombre." };

  const lines = raw.split(/\r?\n/);
  if (lines.length > MAX_LINES) {
    return { error: `Demasiadas líneas (máximo ${MAX_LINES} por import).` };
  }

  const parsed: ParsedLine[] = [];
  for (const l of lines) {
    const p = parseLine(l);
    if (p !== null) parsed.push(p);
  }

  if (parsed.length === 0) {
    return { error: "No se encontró ninguna línea para procesar." };
  }

  const salteadas: BulkImportSkipped[] = [];
  const valid = parsed.filter((p): p is ParsedLine & { ok: true } => {
    if (!p.ok) {
      salteadas.push({ linea: p.raw, razon: p.razon });
      return false;
    }
    return true;
  });

  // Deduplicate within the input itself (same phone twice in the textarea).
  const seenInBatch = new Set<string>();
  const dedupedValid: typeof valid = [];
  for (const v of valid) {
    if (seenInBatch.has(v.phone)) {
      salteadas.push({ linea: v.raw, razon: "Teléfono duplicado dentro de este import." });
      continue;
    }
    seenInBatch.add(v.phone);
    dedupedValid.push(v);
  }

  if (dedupedValid.length === 0) {
    return { aceptadas: [], salteadas };
  }

  const supabase = await createClient();

  // Verify the grupo exists (RLS will also block if no access).
  const { data: grupo, error: grupoErr } = await supabase
    .from("grupos")
    .select("id, status")
    .eq("id", grupoId)
    .maybeSingle();
  if (grupoErr) return { error: `No se pudo cargar el grupo: ${grupoErr.message}` };
  if (!grupo) return { error: "El grupo no existe o no tenés acceso." };
  if (grupo.status !== "activo") {
    return { error: "El grupo está archivado. Reactivalo antes de invitar." };
  }

  const phones = dedupedValid.map((v) => v.phone);

  // Phones already registered as players.
  const { data: existingPlayers, error: playersErr } = await supabase
    .from("players")
    .select("phone")
    .in("phone", phones);
  if (playersErr) {
    return { error: `No se pudo verificar jugadores existentes: ${playersErr.message}` };
  }
  const phonesWithPlayer = new Set((existingPlayers ?? []).map((p) => p.phone).filter(Boolean));

  // Phones with a pending invite for this grupo.
  const nowIso = new Date().toISOString();
  const { data: pendingInvites, error: pendingErr } = await supabase
    .from("player_invitations")
    .select("phone")
    .eq("grupo_id", grupoId)
    .in("phone", phones)
    .is("used_at", null)
    .is("declined_at", null)
    .gt("expires_at", nowIso);
  if (pendingErr) {
    return { error: `No se pudo verificar invitaciones pendientes: ${pendingErr.message}` };
  }
  const phonesWithPending = new Set((pendingInvites ?? []).map((p) => p.phone));

  const toInsert = dedupedValid.filter((v) => {
    if (phonesWithPlayer.has(v.phone)) {
      salteadas.push({ linea: v.raw, razon: "Ya hay un jugador registrado con ese teléfono." });
      return false;
    }
    if (phonesWithPending.has(v.phone)) {
      salteadas.push({
        linea: v.raw,
        razon: "Ya existe una invitación pendiente para ese teléfono en este grupo.",
      });
      return false;
    }
    return true;
  });

  if (toInsert.length === 0) {
    return { aceptadas: [], salteadas };
  }

  const expiresAt = new Date(Date.now() + DAYS_VALID * 24 * 60 * 60 * 1000).toISOString();
  const rows = toInsert.map((v) => ({
    token: generateToken(),
    phone: v.phone,
    nombre_tentativo: v.nombre,
    grupo_id: grupoId,
    created_by: ctx.userId,
    expires_at: expiresAt,
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from("player_invitations")
    .insert(rows)
    .select("token, phone, nombre_tentativo");

  if (insertErr || !inserted) {
    return {
      error: `No se pudieron crear las invitaciones: ${insertErr?.message ?? "sin detalle"}`,
    };
  }

  const origin = await getOrigin();
  const aceptadas: BulkImportEntry[] = inserted.map((row) => ({
    phone: row.phone,
    nombre: row.nombre_tentativo ?? "",
    link: origin ? `${origin}/invite/${row.token}` : `/invite/${row.token}`,
  }));

  return { aceptadas, salteadas };
}
