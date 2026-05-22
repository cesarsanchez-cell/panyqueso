"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const PasswordSchema = z
  .object({
    password: z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  });

export type PerfilState = { ok: true } | { error: string } | null;

export async function updatePassword(_prev: PerfilState, formData: FormData): Promise<PerfilState> {
  const parsed = PasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first?.message ?? "Datos invalidos" };
  }

  const supabase = await createClient();

  // La sesion existente (validada por middleware) habilita updateUser.
  // No exigimos password actual: si alguien tiene la sesion fisica, ya esta dentro.
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return { error: "No se pudo actualizar la contraseña. Intentá de nuevo." };
  }

  return { ok: true };
}
