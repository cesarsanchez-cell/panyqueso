"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { parseArPhone } from "@/lib/phone";
import { notifyGroupWelcome } from "@/lib/push/actions";
import { createClient } from "@/lib/supabase/server";

// Vigencia del invite group-level (sin partido asociado): 30 días.
const INVITE_DAYS_VALID = 30;

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

// ---------------------------------------------------------------------------
// Paso 1: buscar por celular
// ---------------------------------------------------------------------------
export type LookupResult =
  | { ok: false; error: string }
  | { ok: true; exists: false; celular: string }
  | {
      ok: true;
      exists: true;
      celular: string;
      playerId: string;
      nombre: string;
      apodo: string | null;
      avatarUrl: string | null;
      alreadyMember: boolean;
    };

/**
 * Busca un jugador por celular vía lookup_jugador_por_celular (SECURITY DEFINER,
 * dedup global, gate can_manage_grupo). Devuelve datos seguros para confirmar
 * identidad o exists=false. El celular se normaliza a E164 acá.
 */
export async function lookupJugador(grupoId: string, celularRaw: string): Promise<LookupResult> {
  await requireRole(["admin", "coordinador"]);

  if (!grupoId) return { ok: false, error: "Elegí un grupo." };
  const celular = parseArPhone(celularRaw);
  if (!celular) {
    return { ok: false, error: "Celular inválido. Usá un número argentino (ej. 11 2345 6789)." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lookup_jugador_por_celular", {
    p_grupo_id: grupoId,
    p_celular: celular,
  });

  if (error) {
    if (error.code === "P0013") return { ok: false, error: "No gestionás ese grupo." };
    return { ok: false, error: "No se pudo buscar. Probá de nuevo." };
  }

  const r = data as {
    exists?: boolean;
    player_id?: string;
    nombre?: string;
    apodo?: string | null;
    avatar_url?: string | null;
    already_member?: boolean;
  } | null;

  if (!r?.exists) return { ok: true, exists: false, celular };

  return {
    ok: true,
    exists: true,
    celular,
    playerId: r.player_id ?? "",
    nombre: r.nombre ?? "",
    apodo: r.apodo ?? null,
    avatarUrl: r.avatar_url ?? null,
    alreadyMember: r.already_member === true,
  };
}

// ---------------------------------------------------------------------------
// Paso 2a: el celular existe -> vincular al grupo
// ---------------------------------------------------------------------------
export type VincularResult =
  | { ok: false; error: string }
  | { ok: true; nombre: string; pushed: boolean };

/**
 * Vincula un jugador existente al grupo (vincular_jugador_a_grupo, hereda
 * rating). Tras vincular, dispara el push de bienvenida best-effort.
 */
export async function vincularJugador(grupoId: string, celular: string): Promise<VincularResult> {
  await requireRole(["admin", "coordinador"]);

  if (!grupoId) return { ok: false, error: "Elegí un grupo." };
  const phone = parseArPhone(celular);
  if (!phone) return { ok: false, error: "Celular inválido." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vincular_jugador_a_grupo", {
    p_grupo_id: grupoId,
    p_celular: phone,
  });

  if (error) {
    switch (error.code) {
      case "P0032":
        return { ok: false, error: "Ese jugador ya está en el grupo." };
      case "P0033":
        return { ok: false, error: "Ese jugador ya no existe. Probá invitarlo." };
      case "P0013":
        return { ok: false, error: "No gestionás ese grupo." };
      case "P0031":
        return { ok: false, error: "El grupo está archivado." };
      default:
        return { ok: false, error: "No se pudo vincular. Probá de nuevo." };
    }
  }

  const r = data as { player_id?: string; nombre?: string } | null;

  // Push de bienvenida best-effort: solo llega si el jugador ya tiene la app.
  let pushed = false;
  if (r?.player_id) {
    const res = await notifyGroupWelcome(r.player_id, grupoId);
    pushed = res.ok && (res.sent ?? 0) > 0;
  }

  revalidatePath("/jugadores");
  return { ok: true, nombre: r?.nombre ?? "", pushed };
}

// ---------------------------------------------------------------------------
// Paso 2b: el celular no existe -> invitar a completar su ficha
// ---------------------------------------------------------------------------
export type InvitarResult =
  | { ok: false; error: string }
  | { ok: true; link: string; nombre: string };

/**
 * Crea (o reutiliza) un invite group-level para que un jugador NUEVO complete su
 * propia ficha vía /invite/<token>. Al completarla queda de alta directo con
 * rating neutro 6 (FUT-110). Devuelve el link para compartir por WhatsApp.
 */
export async function invitarJugadorNuevo(
  grupoId: string,
  celularRaw: string,
  nombreRaw: string,
): Promise<InvitarResult> {
  const ctx = await requireRole(["admin", "coordinador"]);

  if (!grupoId) return { ok: false, error: "Elegí un grupo." };
  const nombre = nombreRaw.trim();
  if (!nombre) return { ok: false, error: "Falta el nombre." };
  if (nombre.length > 80) return { ok: false, error: "Nombre demasiado largo (máx 80)." };
  const celular = parseArPhone(celularRaw);
  if (!celular) {
    return { ok: false, error: "Celular inválido. Usá un número argentino (ej. 11 2345 6789)." };
  }

  const supabase = await createClient();

  // Reconfirmar (autoritativo + gate) que el celular sigue sin existir: si entre
  // la búsqueda y el invite alguien lo dio de alta, mandamos a vincular.
  const { data: look, error: lookErr } = await supabase.rpc("lookup_jugador_por_celular", {
    p_grupo_id: grupoId,
    p_celular: celular,
  });
  if (lookErr) {
    if (lookErr.code === "P0013") return { ok: false, error: "No gestionás ese grupo." };
    return { ok: false, error: "No se pudo invitar. Probá de nuevo." };
  }
  if ((look as { exists?: boolean } | null)?.exists) {
    return {
      ok: false,
      error: "Ese celular ya es de un jugador. Volvé a buscarlo para vincularlo.",
    };
  }

  // El grupo tiene que estar activo.
  const { data: grupo, error: gErr } = await supabase
    .from("grupos")
    .select("id, status")
    .eq("id", grupoId)
    .maybeSingle();
  if (gErr) return { ok: false, error: "No se pudo cargar el grupo." };
  if (!grupo) return { ok: false, error: "El grupo no existe." };
  if (grupo.status !== "activo") return { ok: false, error: "El grupo está archivado." };

  // ¿Ya hay un invite vigente para ese celular en este grupo? Lo reutilizamos
  // (no acumulamos tokens) en vez de crear uno nuevo.
  const nowIso = new Date().toISOString();
  const { data: pending } = await supabase
    .from("player_invitations")
    .select("token")
    .eq("grupo_id", grupoId)
    .eq("phone", celular)
    .is("used_at", null)
    .is("declined_at", null)
    .gt("expires_at", nowIso)
    .maybeSingle();

  let token: string;
  if (pending?.token) {
    token = pending.token;
  } else {
    token = generateToken();
    const expiresAt = new Date(Date.now() + INVITE_DAYS_VALID * 24 * 60 * 60 * 1000).toISOString();
    const { error: insErr } = await supabase.from("player_invitations").insert({
      token,
      phone: celular,
      nombre_tentativo: nombre,
      grupo_id: grupoId,
      created_by: ctx.userId,
      expires_at: expiresAt,
    });
    if (insErr) {
      return { ok: false, error: `No se pudo crear la invitación: ${insErr.message}` };
    }
  }

  revalidatePath("/jugadores");
  return { ok: true, link: `/invite/${token}`, nombre };
}
