"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type MembresiaTipo = Database["public"]["Enums"]["membresia_tipo"];

export type CreateGrupoState = null | { error: string } | { success: string };
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
    return { error: `No se pudo crear el grupo: ${error?.message ?? "sin detalle"}` };
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
// addMember: agregar player al grupo. Si tipo=suplente, se ubica al final
// de la cola FIFO (orden = max + 1).
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

  const tipoRaw = String(formData.get("tipo") ?? "");
  if (tipoRaw !== "titular" && tipoRaw !== "suplente") {
    return { error: "Tipo inválido." };
  }
  const tipo: MembresiaTipo = tipoRaw;

  const supabase = await createClient();

  // Si es suplente, calculamos orden = max + 1 dentro del grupo.
  let orden: number | null = null;
  if (tipo === "suplente") {
    const { data: maxRow, error: maxErr } = await supabase
      .from("grupo_membresias")
      .select("orden")
      .eq("grupo_id", grupo_id)
      .eq("tipo", "suplente")
      .eq("status", "activo")
      .order("orden", { ascending: false })
      .limit(1);

    if (maxErr) return { error: `No se pudo calcular el orden: ${maxErr.message}` };

    const maxOrden = maxRow && maxRow.length > 0 ? (maxRow[0]?.orden ?? 0) : 0;
    orden = maxOrden + 1;
  }

  const { error } = await supabase.from("grupo_membresias").insert({
    grupo_id,
    player_id,
    tipo,
    orden,
  });

  if (error) {
    // 23505 = unique violation: jugador ya está activo en el grupo.
    if (error.code === "23505") {
      return { error: "El jugador ya es miembro activo de este grupo." };
    }
    return { error: `No se pudo agregar: ${error.message}` };
  }

  revalidatePath(`/grupos/${grupo_id}`);
  return { success: "Jugador agregado." };
}

// ============================================================================
// removeMember: marca la membresía como inactiva. Si era suplente, los
// suplentes con orden mayor corren un puesto.
// ============================================================================
export async function removeMember(formData: FormData): Promise<void> {
  await requireRole("admin");

  const membresia_id = String(formData.get("membresia_id") ?? "").trim();
  if (!membresia_id) return;

  const supabase = await createClient();

  // Leer la membresía antes para saber tipo y orden.
  const { data: m, error: readErr } = await supabase
    .from("grupo_membresias")
    .select("id, grupo_id, tipo, orden, status")
    .eq("id", membresia_id)
    .maybeSingle();

  if (readErr || !m || m.status !== "activo") return;

  // Inactivar.
  const { error: upErr } = await supabase
    .from("grupo_membresias")
    .update({ status: "inactivo", inactivated_at: new Date().toISOString() })
    .eq("id", membresia_id);

  if (upErr) return;

  // Si era suplente, compactar la cola: orden -= 1 para los que estaban detrás.
  if (m.tipo === "suplente" && m.orden !== null) {
    await compactSuplenteQueue(supabase, m.grupo_id, m.orden);
  }

  revalidatePath(`/grupos/${m.grupo_id}`);
}

// ============================================================================
// promoteToTitular: suplente -> titular. Compacta la cola.
// ============================================================================
export async function promoteToTitular(formData: FormData): Promise<void> {
  await requireRole("admin");

  const membresia_id = String(formData.get("membresia_id") ?? "").trim();
  if (!membresia_id) return;

  const supabase = await createClient();

  const { data: m } = await supabase
    .from("grupo_membresias")
    .select("id, grupo_id, tipo, orden, status")
    .eq("id", membresia_id)
    .maybeSingle();

  if (!m || m.status !== "activo" || m.tipo !== "suplente") return;

  const oldOrden = m.orden;
  await supabase
    .from("grupo_membresias")
    .update({ tipo: "titular", orden: null })
    .eq("id", membresia_id);

  if (oldOrden !== null) {
    await compactSuplenteQueue(supabase, m.grupo_id, oldOrden);
  }

  revalidatePath(`/grupos/${m.grupo_id}`);
}

// ============================================================================
// demoteToSuplente: titular -> suplente al final de la cola.
// ============================================================================
export async function demoteToSuplente(formData: FormData): Promise<void> {
  await requireRole("admin");

  const membresia_id = String(formData.get("membresia_id") ?? "").trim();
  if (!membresia_id) return;

  const supabase = await createClient();

  const { data: m } = await supabase
    .from("grupo_membresias")
    .select("id, grupo_id, tipo, status")
    .eq("id", membresia_id)
    .maybeSingle();

  if (!m || m.status !== "activo" || m.tipo !== "titular") return;

  const { data: maxRow } = await supabase
    .from("grupo_membresias")
    .select("orden")
    .eq("grupo_id", m.grupo_id)
    .eq("tipo", "suplente")
    .eq("status", "activo")
    .order("orden", { ascending: false })
    .limit(1);

  const maxOrden = maxRow && maxRow.length > 0 ? (maxRow[0]?.orden ?? 0) : 0;
  const nuevoOrden = maxOrden + 1;

  await supabase
    .from("grupo_membresias")
    .update({ tipo: "suplente", orden: nuevoOrden })
    .eq("id", membresia_id);

  revalidatePath(`/grupos/${m.grupo_id}`);
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

// ============================================================================
// Helper: compactar la cola FIFO tras una salida.
// Decrementa orden en 1 para todos los suplentes activos con orden > fromOrden.
// ============================================================================
async function compactSuplenteQueue(
  supabase: Awaited<ReturnType<typeof createClient>>,
  grupo_id: string,
  fromOrden: number,
): Promise<void> {
  const { data: toShift } = await supabase
    .from("grupo_membresias")
    .select("id, orden")
    .eq("grupo_id", grupo_id)
    .eq("tipo", "suplente")
    .eq("status", "activo")
    .gt("orden", fromOrden);

  if (!toShift || toShift.length === 0) return;

  for (const row of toShift) {
    if (row.orden === null) continue;
    await supabase
      .from("grupo_membresias")
      .update({ orden: row.orden - 1 })
      .eq("id", row.id);
  }
}
