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

/**
 * Alcance de gestión por grupo (Fase 11). Espeja en la app la lógica de
 * `can_manage_grupo` de la DB:
 *   - admin: gestiona TODOS los grupos -> { all: true }.
 *   - coordinador: solo los grupos asignados en coordinador_grupos.
 *   - veedor / player / sin rol: no gestiona ninguno.
 *
 * Para FILTRAR listas de lectura, el veedor ve todo (lo decide cada página);
 * este helper modela la AUTORIDAD de gestión (escritura), no la lectura.
 */
export type ManageScope = { all: boolean; grupoIds: string[] };

export const getManageScope = cache(async (): Promise<ManageScope> => {
  const ctx = await requireUser();
  if (ctx.profile.role === "admin") return { all: true, grupoIds: [] };
  if (ctx.profile.role === "coordinador") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("coordinador_grupos")
      .select("grupo_id")
      .eq("profile_id", ctx.userId);
    return { all: false, grupoIds: (data ?? []).map((r) => r.grupo_id) };
  }
  return { all: false, grupoIds: [] };
});

/** true si el usuario puede gestionar ese grupo (admin o coordinador asignado). */
export async function canManageGrupo(grupoId: string): Promise<boolean> {
  const scope = await getManageScope();
  return scope.all || scope.grupoIds.includes(grupoId);
}
