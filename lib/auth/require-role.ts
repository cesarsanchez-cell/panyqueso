import { redirect } from "next/navigation";
import { cache } from "react";

import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type UserRole = Database["public"]["Enums"]["user_role"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type AuthContext = {
  userId: string;
  email: string;
  profile: Profile;
};

/**
 * Lee el usuario actual y su profile. Cacheado por render: multiples
 * Server Components que llamen a requireUser/requireRole en el mismo
 * request comparten el resultado (una sola query a profiles).
 */
const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  if (!profile) return null;

  return {
    userId: user.id,
    email: user.email ?? "",
    profile,
  };
});

/**
 * Devuelve { userId, email, profile } o redirige a /login.
 * Para Server Components / Server Actions / Route Handlers que solo
 * exigen sesion (no rol especifico).
 */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/**
 * requireUser + chequea que profile.role este en la lista permitida.
 * - Sin sesion -> /login (via requireUser).
 * - Sin rol asignado (NULL) o rol no permitido -> /sin-rol.
 *
 * Uso:
 *   const { profile } = await requireRole("admin");
 *   const { profile } = await requireRole(["admin", "veedor"]);
 */
export async function requireRole(allowed: UserRole | readonly UserRole[]): Promise<AuthContext> {
  const ctx = await requireUser();
  const allowedList = Array.isArray(allowed) ? allowed : [allowed];
  if (!ctx.profile.role || !allowedList.includes(ctx.profile.role)) {
    redirect("/sin-rol");
  }
  return ctx;
}
