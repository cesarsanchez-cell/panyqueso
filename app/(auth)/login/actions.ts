"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { parseArPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

// Schema minimo: tipos. La normalizacion (trim/lowercase) y validacion de
// formato la hacemos manualmente abajo.
const LoginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginState = { error: string; identifier: string } | null;

function safeRedirectTarget(value: string | null): string {
  if (typeof value !== "string" || value.length === 0) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

function syntheticEmailFromPhone(phone: string): string {
  return `${phone.toLowerCase()}@phone.fdlm.local`;
}

// Detecta si el identifier es un celular AR o email. Si es celular, devuelve
// el email sintetico que espera Supabase Auth. parseArPhone acepta el numero
// con o sin +54/9/0/espacios/guiones y lo normaliza a +549<10 digitos>.
function resolveLoginEmail(identifier: string): string | null {
  const phone = parseArPhone(identifier);
  if (phone) return syntheticEmailFromPhone(phone);
  const lower = identifier.toLowerCase();
  if (EMAIL_RE.test(lower)) return lower;
  return null;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  // Backwards compat: el form viejo usaba "email"; el nuevo manda
  // "identifier" o "email" indistintamente.
  const rawIdentifier = formData.get("identifier") ?? formData.get("email");
  const rawPassword = formData.get("password");

  const identifier = typeof rawIdentifier === "string" ? rawIdentifier.trim() : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";

  const parsed = LoginSchema.safeParse({ identifier, password });
  if (!parsed.success) {
    if (!identifier) return { error: "Ingresá tu email o celular", identifier };
    return { error: "Ingresá tu contraseña", identifier };
  }

  const email = resolveLoginEmail(parsed.data.identifier);
  if (!email) {
    return {
      error: "Email o celular inválido (celular: 10 dígitos, ej. 1155551234)",
      identifier,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "Email/celular o contraseña incorrectos", identifier };
  }

  const redirectTo = formData.get("redirectTo");
  redirect(safeRedirectTarget(typeof redirectTo === "string" ? redirectTo : null));
}
