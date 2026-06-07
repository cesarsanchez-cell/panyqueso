// Envío de email de recuperación de contraseña para jugadores.
//
// Contexto: el auth.email de un jugador es sintético (`<celular>@phone.fdlm.local`)
// y no recibe mails. Su email real vive en players.email. Para que el jugador
// pueda auto-resetear su contraseña, generamos el link de recovery contra el
// auth.email sintético (admin.generateLink) y se lo enviamos NOSOTROS al email
// real vía la API de Resend. Admin/veedor (que tienen auth.email real) siguen
// usando el flujo nativo de Supabase (resetPasswordForEmail).
//
// Server-only: usa RESEND_API_KEY. Nunca importar desde un Client Component.

export type SendResult = { ok: true } | { ok: false; error: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Manda el mail con el link de recuperación al email real del jugador.
 * Devuelve un SendResult; el caller decide qué mostrar (anti-enumeración:
 * el mensaje al usuario es genérico pase lo que pase).
 */
export async function sendPlayerRecoveryEmail(to: string, link: string): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    return { ok: false, error: "Email no configurado (faltan RESEND_API_KEY / RESEND_FROM)." };
  }

  const safeLink = escapeHtml(link);
  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; color: #171717; line-height: 1.5;">
      <h2 style="margin: 0 0 12px;">Recuperá tu contraseña</h2>
      <p>Pediste resetear tu contraseña de Pan y Queso. Tocá el botón para elegir una nueva:</p>
      <p style="margin: 20px 0;">
        <a href="${safeLink}"
           style="display: inline-block; background: #171717; color: #fff; text-decoration: none;
                  padding: 12px 20px; border-radius: 8px; font-weight: 600;">
          Cambiar contraseña
        </a>
      </p>
      <p style="font-size: 13px; color: #525252;">
        Si no fuiste vos, ignorá este mail. El link vence en una hora.
      </p>
    </div>
  `;

  let res: Response;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: "Recuperá tu contraseña · Pan y Queso",
        html,
      }),
    });
  } catch (e) {
    return { ok: false, error: `No se pudo conectar con Resend: ${(e as Error).message}` };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Resend respondió ${res.status}: ${body.slice(0, 200)}` };
  }
  return { ok: true };
}
