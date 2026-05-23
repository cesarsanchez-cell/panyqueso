"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
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

export async function addPlayer(_prev: MutationState, formData: FormData): Promise<MutationState> {
  await requireRole("admin");

  const convocatoriaId = String(formData.get("convocatoria_id") ?? "").trim();
  const playerId = String(formData.get("player_id") ?? "").trim();
  if (!convocatoriaId || !playerId) {
    return { error: "Faltan datos para agregar el jugador." };
  }

  const supabase = await createClient();
  const status = await loadConvocatoriaStatus(supabase, convocatoriaId);
  if (status !== "abierta") {
    return { error: "Solo se pueden agregar jugadores si la convocatoria está abierta." };
  }

  const { error } = await supabase
    .from("convocatoria_players")
    .insert({ convocatoria_id: convocatoriaId, player_id: playerId });

  if (error) {
    // 23505 unique (convocatoria_id, player_id) ya esta convocado.
    if (error.code === "23505") {
      return { error: "Ese jugador ya está convocado." };
    }
    // P0030 player_not_approved (trigger convocatoria_players_validate_player).
    // Si la migracion usa otro codigo, igual cae al fallback.
    return { error: `No se pudo agregar: ${error.message}` };
  }

  revalidatePath(`/convocatorias/${convocatoriaId}`);
  return { success: "Jugador agregado." };
}

export async function removePlayer(
  _prev: MutationState,
  formData: FormData,
): Promise<MutationState> {
  await requireRole("admin");

  const convocatoriaId = String(formData.get("convocatoria_id") ?? "").trim();
  const convocatoriaPlayerId = String(formData.get("convocatoria_player_id") ?? "").trim();
  if (!convocatoriaId || !convocatoriaPlayerId) {
    return { error: "Faltan datos para quitar el jugador." };
  }

  const supabase = await createClient();
  const status = await loadConvocatoriaStatus(supabase, convocatoriaId);
  if (status !== "abierta") {
    return { error: "Solo se pueden quitar jugadores si la convocatoria está abierta." };
  }

  const { error } = await supabase
    .from("convocatoria_players")
    .delete()
    .eq("id", convocatoriaPlayerId)
    .eq("convocatoria_id", convocatoriaId);

  if (error) {
    return { error: `No se pudo quitar: ${error.message}` };
  }

  revalidatePath(`/convocatorias/${convocatoriaId}`);
  return { success: "Jugador quitado." };
}

export async function cancelConvocatoria(
  _prev: MutationState,
  formData: FormData,
): Promise<MutationState> {
  await requireRole("admin");

  const convocatoriaId = String(formData.get("convocatoria_id") ?? "").trim();
  if (!convocatoriaId) {
    return { error: "Falta el id de la convocatoria." };
  }

  const supabase = await createClient();
  const status = await loadConvocatoriaStatus(supabase, convocatoriaId);
  if (status !== "abierta") {
    return { error: "Solo se pueden cancelar convocatorias abiertas." };
  }

  const { error } = await supabase
    .from("convocatorias")
    .update({ status: "cancelada" })
    .eq("id", convocatoriaId);

  if (error) {
    return { error: `No se pudo cancelar: ${error.message}` };
  }

  revalidatePath(`/convocatorias/${convocatoriaId}`);
  revalidatePath("/convocatorias");
  return { success: "Convocatoria cancelada." };
}
