"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

// Schema minimo: tipos. La normalizacion (trim/lowercase) y validacion de
// formato la hacemos manualmente abajo. Razon: en Zod 4 los mensajes custom
// pasados como string posicional a metodos chain como .email("...") devuelven
// "Invalid input" en lugar del mensaje en algunos paths, lo que rompe el UX.
const LoginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

// Regex pragmatico de email. No es RFC 5322 estricto - rechaza obviamente
// invalidos y deja pasar el resto. La validacion real la hace Supabase Auth.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginState = { error: string } | null;

/**
 * Anti open-redirect: solo aceptar paths internos.
 */
function safeRedirectTarget(value: string | null): string {
  if (typeof value !== "string" || value.length === 0) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");

  const normalizedEmail = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";

  const parsed = LoginSchema.safeParse({ email: normalizedEmail, password });

  if (!parsed.success) {
    if (!normalizedEmail) return { error: "Ingresá tu email" };
    return { error: "Ingresá tu password" };
  }

  if (!EMAIL_RE.test(parsed.data.email)) {
    return { error: "Email inválido" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Mensaje generico para no permitir enumeracion de cuentas.
    return { error: "Email o password incorrectos" };
  }

  const redirectTo = formData.get("redirectTo");
  redirect(safeRedirectTarget(typeof redirectTo === "string" ? redirectTo : null));
}
