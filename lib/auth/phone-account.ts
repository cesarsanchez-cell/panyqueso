// ============================================================================
// Alta de cuenta por celular (auto-curable ante huérfanos)
// ============================================================================
//
// El alta por link no es atómica: primero crea la cuenta de auth (createUser) y
// después la ficha (claim). Si el proceso se corta entre los dos pasos, queda
// una cuenta de auth con el email sintético del celular pero sin ficha. Esa
// cuenta huérfana ocupa el celular y hace que el próximo intento choque con
// "ya existe una cuenta", un callejón sin salida.
//
// createPhoneAccountHealingOrphan() resuelve eso: si createUser choca con un
// huérfano RECLAMABLE (sin ficha + nunca logueado, según find_reclaimable_orphan),
// lo borra y reintenta. Así el alta se auto-cura y el MISMO link vuelve a
// funcionar, sin intervención manual. Si la cuenta es real (tiene ficha o ya se
// logueó), no la toca y devuelve alreadyActive para mostrar el mensaje de
// "entrá desde /login".
// ============================================================================

import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export function syntheticEmailFromPhone(phone: string): string {
  return `${phone.toLowerCase()}@phone.fdlm.local`;
}

export type CreatePhoneAccountResult =
  | { ok: true; userId: string }
  // alreadyActive: el celular pertenece a una cuenta real (no reclamable).
  | { ok: false; alreadyActive: boolean; message: string };

export async function createPhoneAccountHealingOrphan(
  admin: AdminClient,
  args: { phone: string; password: string; nombre: string },
): Promise<CreatePhoneAccountResult> {
  const email = syntheticEmailFromPhone(args.phone);
  const payload = {
    email,
    password: args.password,
    email_confirm: true,
    user_metadata: { phone: args.phone, nombre: args.nombre },
  };

  const first = await admin.auth.admin.createUser(payload);
  if (!first.error && first.data.user) {
    return { ok: true, userId: first.data.user.id };
  }
  if (!first.error?.message.toLowerCase().includes("already")) {
    return { ok: false, alreadyActive: false, message: first.error?.message ?? "sin detalle" };
  }

  // Colisión: ¿es un huérfano reclamable (sin ficha + nunca logueado)?
  const { data: orphanId } = await admin.rpc("find_reclaimable_orphan", { p_phone: args.phone });
  if (!orphanId) {
    // Cuenta real: no se toca.
    return { ok: false, alreadyActive: true, message: "cuenta activa" };
  }

  // Residuo de un alta cortada: lo barremos y reintentamos.
  await admin.auth.admin.deleteUser(orphanId);
  const retry = await admin.auth.admin.createUser(payload);
  if (!retry.error && retry.data.user) {
    return { ok: true, userId: retry.data.user.id };
  }
  return { ok: false, alreadyActive: false, message: retry.error?.message ?? "sin detalle" };
}
