"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type ResetState = null | { error: string };

export async function setNewPassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const password = formData.get("password");
  const confirm = formData.get("confirm");

  if (typeof password !== "string" || typeof confirm !== "string") {
    return { error: "Datos inválidos." };
  }
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (password !== confirm) {
    return { error: "Las contraseñas no coinciden." };
  }

  const supabase = await createClient();

  // La sesion fue establecida por /auth/callback al canjear el code del mail.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tu sesión expiró. Pedí un nuevo link desde /recuperar." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: `No se pudo actualizar la contraseña: ${error.message}` };
  }

  redirect("/?password_updated=1");
}
