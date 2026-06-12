"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export type GroupRatingState = null | { error: string } | { success: string; pending: boolean };

const SUB_KEYS = [
  "phys_power",
  "phys_speed",
  "phys_stamina",
  "ment_tactical",
  "ment_resilience",
  "ment_attitude",
  "tech_passing",
  "tech_finishing",
  "tech_linkup",
] as const;

const ROLES = new Set(["arquero", "jugador_campo", "mixto"]);
const POSITIONS = new Set(["arquero", "defensor", "mediocampista", "delantero"]);

function parseSub(raw: FormDataEntryValue | null): number | null {
  const n = Number(String(raw ?? "").trim());
  if (!Number.isInteger(n) || n < 1 || n > 10) return null;
  return n;
}

// El admin (luego el coordinador, en 2b) propone editar el rating de un jugador
// EN un grupo (9 subs + rol/posición). Según el gate del grupo, se aplica directo
// o queda pendiente para el veedor (lo decide la RPC propose_group_rating_change).
export async function proposeGroupRating(
  _prev: GroupRatingState,
  formData: FormData,
): Promise<GroupRatingState> {
  await requireRole(["admin", "coordinador"]);

  const playerId = String(formData.get("player_id") ?? "").trim();
  const grupoId = String(formData.get("grupo_id") ?? "").trim();
  if (!playerId || !grupoId) return { error: "Faltan datos del jugador o el grupo." };

  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length === 0) return { error: "Escribí un motivo del cambio." };

  const proposed: Record<string, number | string> = {};
  for (const key of SUB_KEYS) {
    const v = parseSub(formData.get(key));
    if (v === null) return { error: "Cada sub-rating tiene que ser un número del 1 al 10." };
    proposed[key] = v;
  }

  const roleField = String(formData.get("role_field") ?? "").trim();
  if (!ROLES.has(roleField)) return { error: "Rol inválido." };
  proposed.role_field = roleField;

  const positionPref = String(formData.get("position_pref") ?? "").trim();
  if (!POSITIONS.has(positionPref)) return { error: "Posición inválida." };
  proposed.position_pref = positionPref;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("propose_group_rating_change", {
    p_player_id: playerId,
    p_grupo_id: grupoId,
    p_proposed: proposed as Json,
    p_reason: reason,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("not_an_admin")) return { error: "No tenés permiso para este cambio." };
    if (msg.includes("no_group_rating"))
      return { error: "Este jugador no tiene rating en ese grupo." };
    if (msg.includes("reason_required")) return { error: "Escribí un motivo del cambio." };
    return { error: `No se pudo guardar: ${msg}` };
  }

  const applied = (data as { applied?: boolean } | null)?.applied === true;
  revalidatePath(`/jugadores/${playerId}`);
  return applied
    ? { success: "Rating del grupo actualizado.", pending: false }
    : { success: "Cambio enviado al veedor del grupo para aprobación.", pending: true };
}
