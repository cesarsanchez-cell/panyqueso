import { requireRole } from "@/lib/auth/require-role";

import { AppHeader } from "./header";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Cualquier ruta dentro de (app) exige sesion Y rol asignado.
  // Sin sesion -> /login. Sin rol -> /sin-rol.
  const ctx = await requireRole(["admin", "veedor"]);

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppHeader ctx={ctx} />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
