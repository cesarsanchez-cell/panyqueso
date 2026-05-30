"use server";

import { headers } from "next/headers";

import { sendPlayerRecoveryEmail } from "@/lib/email/recovery";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type RecuperarState = null | { error: string } | { success: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mensaje genérico deliberado: no confirmamos si el email existe en la base,
// para no exponer membresía (anti-enumeración).
const GENERIC_SUCCESS =
  "Si ese email tiene cuenta, te llega un mail con el link para resetear. Revisá la bandeja en unos minutos.";

function resolveOrigin(): string | null {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  return null;
}

/**
 * Intenta resetear como JUGADOR: si el email matchea players.email, el auth
 * de ese jugador tiene un email sintético (no recibe mails). Generamos el link
 * de recovery contra ese auth.email y lo enviamos al email real vía Resend.
 *
 * Devuelve true si manejó el caso jugador (matcheó un player con auth), false
 * si no hay player con ese email (entonces el caller cae al flujo estándar de
 * admin/veedor con resetPasswordForEmail).
 */
async function tryPlayerRecovery(email: string, origin: string): Promise<boolean> {
  const admin = createAdminClient();

  // players.email se guarda en minúsculas (igual que el input ya normalizado).
  const { data: player } = await admin
    .from("players")
    .select("auth_user_id")
    .eq("email", email)
    .maybeSingle();

  if (!player?.auth_user_id) return false;

  // Email real de auth (sintético) para generar el link de recovery.
  const { data: authUser, error: getErr } = await admin.auth.admin.getUserById(player.auth_user_id);
  const authEmail = authUser?.user?.email;
  if (getErr || !authEmail) {
    console.error(
      `recuperar: no se pudo resolver el auth user del player (auth_user_id=${player.auth_user_id}):`,
      getErr?.message ?? "sin email",
    );
    return true; // matcheó un player; no caer al flujo admin con un email que no es de auth.
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: authEmail,
  });
  const tokenHash = linkData?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    console.error(
      `recuperar: generateLink falló para ${authEmail}:`,
      linkErr?.message ?? "sin token",
    );
    return true;
  }

  // Mismo formato que el template cross-device de Supabase (verifyOtp en
  // /auth/confirm). Funciona aunque el mail se abra en otro dispositivo.
  const link = `${origin}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=recovery&next=/reset-password`;

  const sent = await sendPlayerRecoveryEmail(email, link);
  if (!sent.ok) {
    console.error(`recuperar: envío de email a ${email} falló:`, sent.error);
  }
  return true;
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
  // el jugador tiene que usar su email real (players.email) o pedirle al admin.
  if (email.endsWith("@phone.fdlm.local")) {
    return {
      error:
        "Ese es un email interno. Ingresá tu email real, o si no cargaste ninguno pedile al organizador que te resetee la contraseña.",
    };
  }

  // Construir origin absoluto. Preferimos NEXT_PUBLIC_SITE_URL, sino el host
  // actual desde headers.
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

  // 1) Caso jugador: si el email matchea players.email, mandamos el link al
  // email real (su auth.email es sintético y no recibe mails).
  const handledAsPlayer = await tryPlayerRecovery(email, origin);
  if (handledAsPlayer) {
    return { success: GENERIC_SUCCESS };
  }

  // 2) Caso admin/veedor (o cualquier auth con email real): flujo nativo de
  // Supabase. El template del dashboard ya apunta a /auth/confirm.
  const redirectTo = `${origin}/auth/callback?next=/reset-password`;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    // No filtramos el detalle ni si el email existe; logueamos server-side.
    console.error(`recuperar: resetPasswordForEmail falló para ${email}:`, error.message);
  }

  return { success: GENERIC_SUCCESS };
}
