import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

import { getPendingAuditCount } from "./auditoria/pending-count";
import { AppHeader } from "./header";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Cualquier ruta dentro de (app) exige sesion Y rol asignado.
  // Sin sesion -> /login. Sin rol -> /sin-rol.
  const ctx = await requireRole(["admin", "veedor", "player", "coordinador"]);

  // Badge de pendientes solo para el veedor (admin no decide, no le sirve).
  const pendingAuditCount = ctx.profile.role === "veedor" ? await getPendingAuditCount() : 0;

  // ¿La cuenta tiene ficha de jugador? El player siempre; admin/veedor/coordinador
  // solo si además juegan (FUT-122). Sin ficha, /mi-perfil y /historial rebotan a
  // Inicio, así que ocultamos esos accesos de la nav para no prometer en falso.
  let hasPlayerFicha = ctx.profile.role === "player";
  if (!hasPlayerFicha) {
    const supabase = await createClient();
    const { data: playerId } = await supabase.rpc("current_player_id");
    hasPlayerFicha = Boolean(playerId);
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppHeader ctx={ctx} pendingAuditCount={pendingAuditCount} hasPlayerFicha={hasPlayerFicha} />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
