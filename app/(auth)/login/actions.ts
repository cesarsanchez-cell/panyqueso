"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalido"),
  password: z.string().min(1, "Ingresa tu password"),
  redirectTo: z.string().optional(),
});

export type LoginState = { error: string } | null;

/**
 * Anti open-redirect: solo aceptar paths internos.
 */
function safeRedirectTarget(value: string | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    redirectTo: formData.get("redirectTo"),
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first?.message ?? "Datos invalidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // No expongas el detalle exacto del error de auth: evita enumeracion de emails.
    return { error: "Email o password incorrectos" };
  }

  redirect(safeRedirectTarget(parsed.data.redirectTo));
}
