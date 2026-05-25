"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

// Schema minimo: tipos. La normalizacion (trim/lowercase) y validacion de
// formato la hacemos manualmente abajo.
const LoginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE = /^\+[1-9]\d{6,14}$/;
const PHONE_NORMALIZE_RE = /[\s\-().]/g;

export type LoginState = { error: string } | null;

function safeRedirectTarget(value: string | null): string {
  if (typeof value !== "string" || value.length === 0) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

function syntheticEmailFromPhone(phone: string): string {
  return `${phone.toLowerCase()}@phone.fdlm.local`;
}

// Detecta si el identifier es un celular (E.164 una vez normalizado) o email.
// Retorna el email real a usar contra Supabase Auth: si era phone, devuelve
// el email sintetico.
function resolveLoginEmail(identifier: string): string | null {
  const normalizedPhone = identifier.replace(PHONE_NORMALIZE_RE, "");
  if (E164_RE.test(normalizedPhone)) {
    return syntheticEmailFromPhone(normalizedPhone);
  }
  const lower = identifier.toLowerCase();
  if (EMAIL_RE.test(lower)) {
    return lower;
  }
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
    if (!identifier) return { error: "Ingresá tu email o celular" };
    return { error: "Ingresá tu contraseña" };
  }

  const email = resolveLoginEmail(parsed.data.identifier);
  if (!email) {
    return { error: "Email o celular inválido (celular en formato +5491155551234)" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "Email/celular o contraseña incorrectos" };
  }

  const redirectTo = formData.get("redirectTo");
  redirect(safeRedirectTarget(typeof redirectTo === "string" ? redirectTo : null));
}
