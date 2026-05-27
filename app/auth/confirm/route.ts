import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Endpoint de confirmacion para mails de Supabase Auth (recovery, magic link,
// email change). A diferencia del /auth/callback que usa PKCE (requiere el
// code_verifier en cookie del browser que pidio el reset), este flow valida
// directo con token_hash via verifyOtp. Funciona cross-device: el usuario
// puede pedir el reset en desktop y abrir el mail en el celular.
//
// Requiere editar el email template de Supabase Auth para que el link apunte
// aca con los parametros token_hash, type y next. Ver el README del proyecto
// o la doc oficial:
//   https://supabase.com/docs/guides/auth/server-side/email-based-auth-with-pkce-flow-for-ssr
//
// Template de "Reset Password" debe quedar:
//   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">
//     Cambiar contraseña
//   </a>
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextRaw = searchParams.get("next") ?? "/";

  // Defensa contra open redirect: solo paths internos.
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?recovery_error=1`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    return NextResponse.redirect(`${origin}/login?recovery_error=1`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
