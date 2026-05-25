import Link from "next/link";

import type { AuthContext } from "@/lib/auth/require-role";

import { logout } from "./actions";

const ROLE_LABEL: Record<NonNullable<AuthContext["profile"]["role"]>, string> = {
  admin: "Admin",
  veedor: "Veedor",
  player: "Jugador",
};

type NavItem = { label: string; href: string; key?: string };

// Nav vacío para player en este PR — la UI de player (/mi-perfil, etc.) llega
// en PR 9. Mientras tanto, un player logueado solo ve "Inicio".
const NAV_ITEMS_BY_ROLE: Record<NonNullable<AuthContext["profile"]["role"]>, NavItem[]> = {
  admin: [
    { label: "Inicio", href: "/" },
    { label: "Jugadores", href: "/jugadores" },
    { label: "Convocatorias", href: "/convocatorias" },
    { label: "Grupos", href: "/grupos" },
    { label: "Lugares", href: "/lugares" },
  ],
  veedor: [
    { label: "Inicio", href: "/" },
    { label: "Jugadores", href: "/jugadores" },
    { label: "Convocatorias", href: "/convocatorias" },
    { label: "Auditoría", href: "/auditoria", key: "auditoria" },
  ],
  player: [
    { label: "Mi perfil", href: "/mi-perfil" },
    { label: "Cambiar password", href: "/perfil" },
  ],
};

export function AppHeader({
  ctx,
  pendingAuditCount,
}: {
  ctx: AuthContext;
  pendingAuditCount: number;
}) {
  const displayName = ctx.profile.nombre?.trim() || ctx.email;
  const roleLabel = ctx.profile.role ? ROLE_LABEL[ctx.profile.role] : null;

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/perfil" className="min-w-0 rounded-md transition hover:opacity-80">
          <p className="truncate text-sm font-semibold text-neutral-900">{displayName}</p>
          {roleLabel ? <p className="text-xs text-neutral-500">{roleLabel}</p> : null}
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            Salir
          </button>
        </form>
      </div>
      <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto border-t border-neutral-100 px-2 sm:px-4">
        {(ctx.profile.role ? NAV_ITEMS_BY_ROLE[ctx.profile.role] : []).map((item) => {
          const showBadge = item.key === "auditoria" && pendingAuditCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm font-medium text-neutral-600 transition hover:text-neutral-900"
            >
              {item.label}
              {showBadge ? (
                <span
                  aria-label={`${pendingAuditCount} solicitudes pendientes`}
                  className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200"
                >
                  {pendingAuditCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
