"use server";

import { createClient } from "@/lib/supabase/server";

export type PerfilState = { ok: true } | { error: string } | null;

export async function updatePassword(_prev: PerfilState, formData: FormData): Promise<PerfilState> {
  const password = formData.get("password");
  const confirm = formData.get("confirm");

  if (typeof password !== "string" || typeof confirm !== "string") {
    return { error: "Datos inválidos" };
  }

  if (password.length < 8) {
    return { error: "La nueva contraseña debe tener al menos 8 caracteres" };
  }

  if (password !== confirm) {
    return { error: "Las contraseñas no coinciden" };
  }

  const supabase = await createClient();

  // La sesion existente (validada por middleware) habilita updateUser.
  // No exigimos password actual: si alguien tiene la sesion fisica, ya esta dentro.
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: "No se pudo actualizar la contraseña. Intentá de nuevo." };
  }

  return { ok: true };
}
