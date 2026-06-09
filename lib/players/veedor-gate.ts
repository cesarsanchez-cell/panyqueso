import type { createClient } from "@/lib/supabase/server";

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

/**
 * Veedor opcional: si `requiere_veedor()` está en false, aplica la solicitud
 * directo vía `admin_apply_sensitive_change` (manteniendo la traza: la
 * solicitud queda 'approved' + audit_log). Si el gate está prendido —o no se
 * pudo leer— NO aplica y la solicitud queda pendiente del veedor (fallback
 * seguro, nunca perdemos el cambio).
 *
 * Devuelve `applied` (si se aplicó directo) y `error` (mensaje si el apply
 * directo falló; en ese caso la solicitud quedó creada y pendiente).
 */
export async function applyDirectIfGateOff(
  supabase: SupabaseLike,
  requestId: string,
): Promise<{ applied: boolean; error: string | null }> {
  const { data: gateOn, error: gateErr } = await supabase.rpc("requiere_veedor");
  if (gateErr || gateOn !== false) {
    return { applied: false, error: null };
  }

  const { error: applyErr } = await supabase.rpc("admin_apply_sensitive_change", {
    p_request_id: requestId,
  });
  if (applyErr) {
    return { applied: false, error: applyErr.message };
  }

  return { applied: true, error: null };
}
