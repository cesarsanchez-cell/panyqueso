import { requireRole } from "@/lib/auth/require-role";

import { getPendingAuditCount } from "./auditoria/pending-count";
import { AppHeader } from "./header";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Cualquier ruta dentro de (app) exige sesion Y rol asignado.
  // Sin sesion -> /login. Sin rol -> /sin-rol.
  const ctx = await requireRole(["admin", "veedor"]);

  // Badge de pendientes solo para el veedor (admin no decide, no le sirve).
  const pendingAuditCount = ctx.profile.role === "veedor" ? await getPendingAuditCount() : 0;

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppHeader ctx={ctx} pendingAuditCount={pendingAuditCount} />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
