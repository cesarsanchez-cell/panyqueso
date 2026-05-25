"use server";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";

export type RecuperarState = null | { error: string } | { success: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function resolveOrigin(): string | null {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  return null;
}

export async function requestPasswordReset(
  _prev: RecuperarState,
  formData: FormData,
): Promise<RecuperarState> {
  const rawEmail = formData.get("email");
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

  if (!email) return { error: "Ingresá tu email." };
  if (!EMAIL_RE.test(email) || email.length > 254) return { error: "Email inválido." };

  // Rechazo explicito de emails sinteticos de jugador. Esos no reciben mail;
  // el jugador tiene que pedirle al admin que le resetee la contraseña.
  if (email.endsWith("@phone.fdlm.local")) {
    return {
      error:
        "Si entrás con celular (jugador), pedile al organizador que te resetee la contraseña por WhatsApp.",
    };
  }

  // Construir redirectTo absoluto. Preferimos NEXT_PUBLIC_SITE_URL, sino el
  // host actual desde headers.
  let origin = resolveOrigin();
  if (!origin) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (host) origin = `${proto}://${host}`;
  }
  if (!origin) {
    return { error: "No se pudo determinar la URL del sitio. Reintentá." };
  }

  const redirectTo = `${origin}/auth/callback?next=/reset-password`;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    return { error: `No se pudo enviar el mail: ${error.message}` };
  }

  // Mensaje deliberadamente generico: no confirmamos si el email existe en
  // la base, para no exponer membresia.
  return {
    success:
      "Si ese email tiene cuenta, te llega un mail con el link para resetear. Revisá la bandeja en unos minutos.",
  };
}
