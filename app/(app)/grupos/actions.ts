"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { requireRole } from "@/lib/auth/require-role";
import { parseArPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

type GrupoFormValues = {
  nombre: string;
  lugar_id: string;
  dia_semana: string;
  hora: string;
  cupo_titulares: string;
};

export type CreateGrupoState =
  | null
  | { error: string; values: GrupoFormValues }
  | { success: string };
export type UpdateGrupoState = null | { error: string } | { success: string };
export type MembershipState = null | { error: string } | { success: string };

const MAX_NOMBRE = 80;
const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseHora(raw: string): string | null {
  return HORA_REGEX.test(raw) ? raw : null;
}

function parseDiaSemana(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 6) return null;
  return n;
}

function parseCupo(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 6 || n > 24) return null;
  return n;
}

// ============================================================================
// createGrupo: admin crea un grupo nuevo.
// ============================================================================
export async function createGrupo(
  _prev: CreateGrupoState,
  formData: FormData,
): Promise<CreateGrupoState> {
  const ctx = await requireRole("admin");

  // Capturamos lo que tipeo el admin para echarlo de vuelta en caso de error.
  // React 19 resetea inputs uncontrolled cuando una form action retorna; sin
  // esto el admin pierde lo cargado cada vez que algo falla.
  const values: GrupoFormValues = {
    nombre: String(formData.get("nombre") ?? "").trim(),
    lugar_id: String(formData.get("lugar_id") ?? "").trim(),
    dia_semana: String(formData.get("dia_semana") ?? ""),
    hora: String(formData.get("hora") ?? ""),
    cupo_titulares: String(formData.get("cupo_titulares") ?? ""),
  };

  const nombre = values.nombre;
  if (!nombre) return { error: "El nombre es obligatorio.", values };
  if (nombre.length > MAX_NOMBRE) {
    return { error: `Nombre demasiado largo (máximo ${MAX_NOMBRE} caracteres).`, values };
  }

  const lugar_id = values.lugar_id;
  if (!lugar_id) return { error: "Falta seleccionar un lugar.", values };

  const dia_semana = parseDiaSemana(values.dia_semana);
  if (dia_semana === null) return { error: "Día de la semana inválido.", values };

  const hora = parseHora(values.hora);
  if (!hora) return { error: "Hora inválida (formato HH:MM).", values };

  const cupo_titulares = parseCupo(values.cupo_titulares);
  if (cupo_titulares === null) {
    return { error: "Cupo de titulares inválido (entre 6 y 24).", values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grupos")
    .insert({
      nombre,
      lugar_id,
      dia_semana,
      hora,
      cupo_titulares,
      owner_id: ctx.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: `No se pudo crear el grupo: ${error?.message ?? "sin detalle"}`, values };
  }

  revalidatePath("/grupos");
  revalidatePath(`/grupos/${data.id}`);
  return { success: "Grupo creado." };
}

// ============================================================================
// updateGrupo: admin edita metadata.
// ============================================================================
export async function updateGrupo(
  _prev: UpdateGrupoState,
  formData: FormData,
): Promise<UpdateGrupoState> {
  await requireRole("admin");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Falta el id." };

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { error: "El nombre es obligatorio." };
  if (nombre.length > MAX_NOMBRE) {
    return { error: `Nombre demasiado largo (máximo ${MAX_NOMBRE} caracteres).` };
  }

  const lugar_id = String(formData.get("lugar_id") ?? "").trim();
  if (!lugar_id) return { error: "Falta seleccionar un lugar." };

  const dia_semana = parseDiaSemana(String(formData.get("dia_semana") ?? ""));
  if (dia_semana === null) return { error: "Día de la semana inválido." };

  const hora = parseHora(String(formData.get("hora") ?? ""));
  if (!hora) return { error: "Hora inválida (formato HH:MM)." };

  const cupo_titulares = parseCupo(String(formData.get("cupo_titulares") ?? ""));
  if (cupo_titulares === null) {
    return { error: "Cupo de titulares inválido (entre 6 y 24)." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("grupos")
    .update({ nombre, lugar_id, dia_semana, hora, cupo_titulares })
    .eq("id", id);

  if (error) return { error: `No se pudo actualizar: ${error.message}` };

  revalidatePath("/grupos");
  revalidatePath(`/grupos/${id}`);
  return { success: "Grupo actualizado." };
}

// ============================================================================
// archiveGrupo / unarchiveGrupo: toggle de status. Soft delete.
// ============================================================================
export async function archiveGrupo(formData: FormData): Promise<void> {
  await requireRole("admin");
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("grupos").update({ status: "archivado" }).eq("id", id);
  revalidatePath("/grupos");
  revalidatePath(`/grupos/${id}`);
}

export async function unarchiveGrupo(formData: FormData): Promise<void> {
  await requireRole("admin");
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("grupos").update({ status: "activo" }).eq("id", id);
  revalidatePath("/grupos");
  revalidatePath(`/grupos/${id}`);
}

// ============================================================================
// addMember: agrega un player a la bolsa del grupo. El modelo nuevo no
// distingue titular/suplente a nivel grupo: ese rol nace en cada convocatoria
// segun orden joined_at y cupo. Por compat con el schema (tipo NOT NULL)
// guardamos 'titular' como placeholder. El trigger se encarga de poner al
// jugador en la conv abierta si existe.
// ============================================================================
export async function addMember(
  _prev: MembershipState,
  formData: FormData,
): Promise<MembershipState> {
  await requireRole("admin");

  const grupo_id = String(formData.get("grupo_id") ?? "").trim();
  if (!grupo_id) return { error: "Falta el grupo." };

  const player_id = String(formData.get("player_id") ?? "").trim();
  if (!player_id) return { error: "Falta seleccionar un jugador." };

  const supabase = await createClient();

  // Si ya existe una membresia (activa o inactiva), reactivamos en lugar
  // de insertar. Reseteamos joined_at para que entre al final de la bolsa.
  const { data: existing } = await supabase
    .from("grupo_membresias")
    .select("id, status")
    .eq("grupo_id", grupo_id)
    .eq("player_id", player_id)
    .maybeSingle();

  if (existing) {
    if (existing.status === "activo") {
      return { error: "El jugador ya es miembro activo de este grupo." };
    }
    const { error: upErr } = await supabase
      .from("grupo_membresias")
      .update({
        status: "activo",
        inactivated_at: null,
        inactivated_by: null,
        tipo: "titular",
        orden: null,
        joined_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (upErr) return { error: `No se pudo reactivar: ${upErr.message}` };
  } else {
    const { error } = await supabase.from("grupo_membresias").insert({
      grupo_id,
      player_id,
      tipo: "titular",
      orden: null,
    });
    if (error) {
      if (error.code === "23505") {
        return { error: "El jugador ya es miembro activo de este grupo." };
      }
      return { error: `No se pudo agregar: ${error.message}` };
    }
  }

  revalidatePath(`/grupos/${grupo_id}`);
  return { success: "Jugador agregado a la bolsa del grupo." };
}

// ============================================================================
// removeMember: marca la membresia como inactiva. El trigger sync_open_conv
// se encarga de sacar al player de la convocatoria abierta y subir el primer
// suplente si era titular.
// ============================================================================
export async function removeMember(formData: FormData): Promise<void> {
  await requireRole("admin");

  const membresia_id = String(formData.get("membresia_id") ?? "").trim();
  if (!membresia_id) return;

  const supabase = await createClient();
  const { data: m } = await supabase
    .from("grupo_membresias")
    .select("id, grupo_id, status")
    .eq("id", membresia_id)
    .maybeSingle();

  if (!m || m.status !== "activo") return;

  await supabase
    .from("grupo_membresias")
    .update({ status: "inactivo", inactivated_at: new Date().toISOString() })
    .eq("id", membresia_id);

  revalidatePath(`/grupos/${m.grupo_id}`);
}

// ============================================================================
// createGroupInvitation: invita de a UNO al grupo (celular + nombre), sin pasar
// por el import masivo. Reusa el mismo modelo player_invitations. Devuelve el
// link + telefono + nombre para que el form muestre el boton de WhatsApp al
// instante (mismo criterio que el resto de las invitaciones).
// ============================================================================
export type CreateGroupInviteState =
  | null
  | { error: string }
  | { ok: true; phone: string; nombre: string; link: string };

const INVITE_DAYS_VALID = 30;

export async function createGroupInvitation(
  _prev: CreateGroupInviteState,
  formData: FormData,
): Promise<CreateGroupInviteState> {
  const ctx = await requireRole("admin");

  const grupoId = String(formData.get("grupo_id") ?? "").trim();
  if (!grupoId) return { error: "Falta el grupo." };

  const phoneRaw = String(formData.get("phone") ?? "").trim();
  if (!phoneRaw) return { error: "El celular es obligatorio." };
  const phone = parseArPhone(phoneRaw);
  if (!phone) return { error: "Celular inválido. Ingresá los 10 dígitos (ej: 1155551234)." };

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { error: "El nombre es obligatorio." };
  if (nombre.length > MAX_NOMBRE) {
    return { error: `Nombre demasiado largo (máximo ${MAX_NOMBRE} caracteres).` };
  }

  const supabase = await createClient();

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

  // Skip si el telefono ya es un jugador registrado.
  const { data: existingPlayer, error: playerErr } = await supabase
    .from("players")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (playerErr) return { error: `No se pudo verificar jugadores: ${playerErr.message}` };
  if (existingPlayer) {
    return { error: "Ya hay un jugador registrado con ese teléfono." };
  }

  // Skip si ya hay una invitacion pendiente para ese telefono en este grupo.
  const nowIso = new Date().toISOString();
  const { data: pendingSame, error: pendingErr } = await supabase
    .from("player_invitations")
    .select("id")
    .eq("grupo_id", grupoId)
    .eq("phone", phone)
    .is("used_at", null)
    .is("declined_at", null)
    .gt("expires_at", nowIso)
    .maybeSingle();
  if (pendingErr) return { error: `No se pudo verificar invitaciones: ${pendingErr.message}` };
  if (pendingSame) {
    return { error: "Ya existe una invitación pendiente para ese teléfono en este grupo." };
  }

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_DAYS_VALID * 24 * 60 * 60 * 1000).toISOString();

  const { error: insertErr } = await supabase.from("player_invitations").insert({
    token,
    phone,
    nombre_tentativo: nombre,
    grupo_id: grupoId,
    created_by: ctx.userId,
    expires_at: expiresAt,
  });
  if (insertErr) {
    return { error: `No se pudo crear la invitación: ${insertErr.message}` };
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : "";

  revalidatePath(`/grupos/${grupoId}`);
  return {
    ok: true,
    phone,
    nombre,
    link: origin ? `${origin}/invite/${token}` : `/invite/${token}`,
  };
}

// ============================================================================
// cancelInvitation: marca una invitacion pendiente como expirada (expires_at
// = now()). No se borra: queda como historial. El link deja de funcionar
// porque la pagina publica /invite/<token> chequea expires_at > now().
// ============================================================================
export async function cancelInvitation(formData: FormData): Promise<void> {
  await requireRole("admin");

  const invitation_id = String(formData.get("invitation_id") ?? "").trim();
  if (!invitation_id) return;

  const supabase = await createClient();

  const { data: inv } = await supabase
    .from("player_invitations")
    .select("id, grupo_id, used_at, declined_at")
    .eq("id", invitation_id)
    .maybeSingle();

  if (!inv) return;
  if (inv.used_at !== null || inv.declined_at !== null) return;

  await supabase
    .from("player_invitations")
    .update({ expires_at: new Date().toISOString() })
    .eq("id", invitation_id);

  revalidatePath(`/grupos/${inv.grupo_id}`);
}
