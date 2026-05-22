import Link from "next/link";

import type { AuthContext } from "@/lib/auth/require-role";

import { logout } from "./actions";

const ROLE_LABEL: Record<NonNullable<AuthContext["profile"]["role"]>, string> = {
  admin: "Admin",
  veedor: "Veedor",
};

export function AppHeader({ ctx }: { ctx: AuthContext }) {
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
    </header>
  );
}
