import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Callback de Supabase Auth (PKCE). Se usa cuando el usuario llega desde un
// mail de recuperacion o cualquier otro magic link: el link incluye ?code=...
// y nosotros tenemos que cambiarlo por una sesion antes de redirigirlo a la
// pagina destino (`next`).
//
// Si falla, mandamos al login con un flash de error.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") ?? "/";

  // Solo aceptamos un path interno como next (defensa contra open redirect).
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?recovery_error=1`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?recovery_error=1`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
