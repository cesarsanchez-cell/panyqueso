import { redirect } from "next/navigation";

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
 * Devuelve el usuario autenticado y su profile.
 * Redirige a /login si no hay sesion.
 *
 * Pensado para usarse en Server Components, Server Actions y Route Handlers
 * que no requieren un rol especifico (ej. /perfil).
 */
export async function requireUser(): Promise<AuthContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  if (!profile) {
    // Edge case: usuario en auth.users sin row en profiles. No deberia pasar
    // porque el trigger on_auth_user_created lo crea. Si pasa, forzamos
    // re-login para evitar estados inconsistentes.
    redirect("/login");
  }

  return {
    userId: user.id,
    email: user.email ?? "",
    profile,
  };
}

/**
 * Asegura que el usuario autenticado tenga uno de los roles permitidos.
 * - Sin sesion -> /login.
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
