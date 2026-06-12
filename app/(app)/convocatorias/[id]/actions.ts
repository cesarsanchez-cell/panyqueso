"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/require-role";
import { notifyOpenSpot } from "@/lib/push/actions";
import { createClient } from "@/lib/supabase/server";

export type MutationState = null | { error: string } | { success: string };

async function loadConvocatoriaStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  convocatoriaId: string,
) {
  const { data } = await supabase
    .from("convocatorias")
    .select("status")
    .eq("id", convocatoriaId)
    .maybeSingle();
  return data?.status ?? null;
}

function statusPermiteEdicion(status: string | null): boolean {
  // Admin puede modificar el roster en abierta, cerrada y jugada (este
  // ultimo es el "ultimo recurso" para registrar eventualidades). La
  // cancelada queda como historico no editable.
  return status === "abierta" || status === "cerrada" || status === "jugada";
}

export async function setCupo(_prev: MutationState, formData: FormData): Promise<MutationState> {
  await requireRole(["admin", "coordinador"]);

  const convocatoriaId = String(formData.get("convocatoria_id") ?? "").trim();
  const nuevoCupo = Number(String(formData.get("cupo") ?? "").trim());

  if (!convocatoriaId) return { error: "Falta el id de la convocatoria." };
  if (!Number.isInteger(nuevoCupo) || nuevoCupo < 6 || nuevoCupo > 24) {
    return { error: "El cupo de titulares debe ser un número entre 6 y 24." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_convocatoria_cupo", {
    p_convocatoria_id: convocatoriaId,
    p_nuevo_cupo: nuevoCupo,
  });

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "P0060")
      return { error: "Solo se puede cambiar el cupo de una convocatoria abierta." };
    if (code === "P0061") return { error: "El cupo debe estar entre 6 y 24." };
    if (code === "P0001") return { error: "No tenés permisos para esta acción." };
    return { error: `No se pudo cambiar el cupo: ${error.message}` };
  }

  revalidatePath(`/convocatorias/${convocatoriaId}`);
  return { success: "Cupo de titulares actualizado." };
}

export async function addPlayer(_prev: MutationState, formData: FormData): Promise<MutationState> {
  await requireRole(["admin", "coordinador"]);

  const convocatoriaId = String(formData.get("convocatoria_id") ?? "").trim();
  const playerId = String(formData.get("player_id") ?? "").trim();
  const nombreLibre = String(formData.get("nombre_libre") ?? "").trim();

  if (!convocatoriaId) {
    return { error: "Falta el id de la convocatoria." };
  }
  // Uno y solo uno: o playerId del catalogo o nombreLibre (invitado).
  if (!playerId && !nombreLibre) {
    return { error: "Indicá un jugador del catálogo o un nombre libre." };
  }
  if (playerId && nombreLibre) {
    return { error: "Elegí jugador del catálogo o nombre libre, no las dos cosas." };
  }

  const supabase = await createClient();
  const status = await loadConvocatoriaStatus(supabase, convocatoriaId);
  if (!statusPermiteEdicion(status)) {
    return { error: "La convocatoria está cancelada. No se puede editar." };
  }

  const { data: conv } = await supabase
    .from("convocatorias")
    .select("grupo_id")
    .eq("id", convocatoriaId)
    .maybeSingle();

  // Caso 1: invitado libre (sin player_id). Inserta como invitado puntual,
  // sin pasar por grupo_membresias. nombre_libre se muestra directo en el
  // lineup, no depende de players_public.
  if (nombreLibre) {
    const rolInvitado = await computeRolForNewEntry(supabase, convocatoriaId, conv?.grupo_id);
    const { error } = await supabase.from("convocatoria_players").insert({
      convocatoria_id: convocatoriaId,
      player_id: null,
      nombre_libre: nombreLibre,
      rol_en_convocatoria: rolInvitado.rol,
      orden_suplente: rolInvitado.ordenSuplente,
      attendance_status: "confirmado",
    });
    if (error) {
      return { error: `No se pudo agregar: ${error.message}` };
    }
    revalidatePath(`/convocatorias/${convocatoriaId}`);
    return { success: `Invitado "${nombreLibre}" agregado.` };
  }

  // Caso 2: player del catalogo. Si la conv tiene grupo, garantizamos que
  // el player es miembro activo del grupo antes de armar el roster. Asi el
  // modelo bolsa v3 queda consistente y players_public expone el nombre al
  // resto de los miembros del grupo.

  // Estado previo en la conv (para distinguir nuevo / declinado / ya activo).
  const { data: existingRow } = await supabase
    .from("convocatoria_players")
    .select("id, attendance_status")
    .eq("convocatoria_id", convocatoriaId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (existingRow && existingRow.attendance_status !== "declinado") {
    return { error: "Ese jugador ya está convocado." };
  }

  if (conv?.grupo_id) {
    // Asegurar membresia activa en el grupo. Si el status cambia
    // inactivo->activo (o se crea), el trigger sync_open_conv_after_membership_change
    // arma el row en la conv abierta (titular si hay cupo, sino suplente al
    // final) y reactiva un row declinado existente.
    //
    // Puede haber multiples rows historicos (la unique es parcial sobre
    // status='activo'): pedimos el mas reciente y decidimos sobre ese.
    const { data: gmRows } = await supabase
      .from("grupo_membresias")
      .select("id, status")
      .eq("grupo_id", conv.grupo_id)
      .eq("player_id", playerId)
      .order("status", { ascending: true }) // 'activo' < 'inactivo' alfabeticamente
      .order("joined_at", { ascending: false })
      .limit(1);
    const gm = gmRows && gmRows.length > 0 ? gmRows[0] : null;

    let triggerFired = false;
    if (!gm) {
      const { error: insErr } = await supabase.from("grupo_membresias").insert({
        grupo_id: conv.grupo_id,
        player_id: playerId,
        tipo: "titular",
        orden: null,
      });
      if (insErr) {
        return { error: `No se pudo sumar al grupo: ${insErr.message}` };
      }
      triggerFired = true;
    } else if (gm.status !== "activo") {
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
        .eq("id", gm.id);
      if (upErr) {
        return { error: `No se pudo reactivar en el grupo: ${upErr.message}` };
      }
      triggerFired = true;
    }

    if (triggerFired) {
      // El trigger ya armo el row en la conv. Revalidamos y salimos.
      revalidatePath(`/grupos/${conv.grupo_id}`);
      revalidatePath(`/convocatorias/${convocatoriaId}`);
      return { success: "Jugador agregado." };
    }
    // Ya era miembro activo: el trigger no se disparo, seguimos al insert
    // manual con la logica de cupo.
  }

  // Caso 2b (sin grupo, o ya miembro activo): insert/update directo con
  // logica de cupo (titular si hay vacante, sino suplente al final).
  const rolNuevo = await computeRolForNewEntry(supabase, convocatoriaId, conv?.grupo_id);

  if (existingRow) {
    // Estaba declinado: reactivar con el rol/orden del cupo actual.
    const { error: upErr } = await supabase
      .from("convocatoria_players")
      .update({
        attendance_status: "confirmado",
        rol_en_convocatoria: rolNuevo.rol,
        orden_suplente: rolNuevo.ordenSuplente,
      })
      .eq("id", existingRow.id);
    if (upErr) {
      return { error: `No se pudo agregar: ${upErr.message}` };
    }
  } else {
    const { error: insErr } = await supabase.from("convocatoria_players").insert({
      convocatoria_id: convocatoriaId,
      player_id: playerId,
      nombre_libre: null,
      rol_en_convocatoria: rolNuevo.rol,
      orden_suplente: rolNuevo.ordenSuplente,
      attendance_status: "confirmado",
    });
    if (insErr) {
      if (insErr.code === "23505") {
        return { error: "Ese jugador ya está convocado." };
      }
      return { error: `No se pudo agregar: ${insErr.message}` };
    }
  }

  revalidatePath(`/convocatorias/${convocatoriaId}`);
  return { success: "Jugador agregado." };
}

async function computeRolForNewEntry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  convocatoriaId: string,
  grupoId: string | null | undefined,
): Promise<{ rol: "titular" | "suplente"; ordenSuplente: number | null }> {
  if (!grupoId) return { rol: "titular", ordenSuplente: null };

  // Fase 10: el cupo de titulares lo manda la CONVOCATORIA (cupo_maximo, editable
  // por el admin), no el grupo. El grupo es solo el default al crearla.
  const [{ data: conv }, { count: titularesCount }] = await Promise.all([
    supabase.from("convocatorias").select("cupo_maximo").eq("id", convocatoriaId).maybeSingle(),
    supabase
      .from("convocatoria_players")
      .select("id", { count: "exact", head: true })
      .eq("convocatoria_id", convocatoriaId)
      .eq("rol_en_convocatoria", "titular")
      .neq("attendance_status", "declinado"),
  ]);

  if (!conv || (titularesCount ?? 0) < conv.cupo_maximo) {
    return { rol: "titular", ordenSuplente: null };
  }

  const { data: maxRow } = await supabase
    .from("convocatoria_players")
    .select("orden_suplente")
    .eq("convocatoria_id", convocatoriaId)
    .eq("rol_en_convocatoria", "suplente")
    .neq("attendance_status", "declinado")
    .order("orden_suplente", { ascending: false })
    .limit(1);
  const maxOrden = maxRow && maxRow.length > 0 ? (maxRow[0]?.orden_suplente ?? 0) : 0;
  return { rol: "suplente", ordenSuplente: maxOrden + 1 };
}

export async function removePlayer(
  _prev: MutationState,
  formData: FormData,
): Promise<MutationState> {
  await requireRole(["admin", "coordinador"]);

  const convocatoriaId = String(formData.get("convocatoria_id") ?? "").trim();
  const convocatoriaPlayerId = String(formData.get("convocatoria_player_id") ?? "").trim();
  if (!convocatoriaId || !convocatoriaPlayerId) {
    return { error: "Faltan datos para quitar el jugador." };
  }

  const supabase = await createClient();
  const status = await loadConvocatoriaStatus(supabase, convocatoriaId);
  if (!statusPermiteEdicion(status)) {
    return { error: "La convocatoria está cancelada. No se puede editar." };
  }

  // Guardamos a quién saca el admin para no mandarle a esa persona el aviso de
  // "se liberó un lugar".
  const { data: removedRow } = await supabase
    .from("convocatoria_players")
    .select("player_id")
    .eq("id", convocatoriaPlayerId)
    .maybeSingle();

  // RPC encapsula: DELETE + promote primer suplente si era titular +
  // compactar cola. Asi evitamos huecos en el cupo de titulares.
  const { error } = await supabase.rpc("admin_remove_from_convocatoria", {
    p_convocatoria_player_id: convocatoriaPlayerId,
  });

  if (error) {
    if (error.code === "P0070") {
      return { error: "Ese jugador ya no está en la convocatoria." };
    }
    return { error: `No se pudo quitar: ${error.message}` };
  }

  revalidatePath(`/convocatorias/${convocatoriaId}`);

  // Best-effort: si quedó un lugar libre (titular o banca de suplentes), avisar
  // al grupo. No le avisamos al jugador que el admin acaba de sacar.
  await notifyOpenSpot(convocatoriaId, { excludePlayerId: removedRow?.player_id ?? undefined });

  return { success: "Jugador quitado." };
}

export async function cancelConvocatoria(
  _prev: MutationState,
  formData: FormData,
): Promise<MutationState> {
  await requireRole(["admin", "coordinador"]);

  const convocatoriaId = String(formData.get("convocatoria_id") ?? "").trim();
  if (!convocatoriaId) {
    return { error: "Falta el id de la convocatoria." };
  }

  const supabase = await createClient();
  const status = await loadConvocatoriaStatus(supabase, convocatoriaId);
  if (status !== "abierta") {
    return { error: "Solo se pueden cancelar convocatorias abiertas." };
  }

  // Bug 5: una conv cancelada no aporta al historial. La eliminamos en vez de
  // dejarla con status='cancelada'. convocatoria_players cascada; las invites
  // se desvinculan (ON DELETE SET NULL). La RLS solo permite borrar 'abierta'.
  const { error } = await supabase.from("convocatorias").delete().eq("id", convocatoriaId);

  if (error) {
    return { error: `No se pudo cancelar: ${error.message}` };
  }

  // El row ya no existe: redirigimos al listado (la página de detalle daría 404).
  revalidatePath("/convocatorias");
  redirect("/convocatorias");
}
