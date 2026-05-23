"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/require-role";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type ChangeRequestInsert = Database["public"]["Tables"]["player_change_requests"]["Insert"];

export type StatusChangeAction = "deactivate_player" | "reactivate_player";

export type StatusChangeState = null | { error: string };

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
  const { error } = await supabase.from("player_change_requests").insert(insertRow);

  if (error) {
    return { error: `No se pudo crear la solicitud: ${error.message}` };
  }

  revalidatePath(`/jugadores/${playerId}`);
  revalidatePath("/auditoria");

  const flashKey = action === "deactivate_player" ? "deactivate=1" : "reactivate=1";
  redirect(`/jugadores/${playerId}?${flashKey}`);
}
