"use server";

import webpush from "web-push";

import { createClient } from "@/lib/supabase/server";

export type PushResult = { ok: true; sent?: number } | { ok: false; error: string };

// Configura las VAPID keys (firman los envíos). Sin ellas no se puede mandar.
function configureVapid(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:no-reply@panyqueso.ar";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

// Guarda la suscripción del navegador actual (vía RPC SECURITY DEFINER, que la
// asocia al jugador logueado y hace upsert por endpoint).
export async function savePushSubscription(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<PushResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: sub.p256dh,
    p_auth: sub.auth,
    p_user_agent: sub.userAgent ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deletePushSubscription(endpoint: string): Promise<PushResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_push_subscription", { p_endpoint: endpoint });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Manda un push de prueba a las suscripciones del jugador actual (RLS: solo las
// suyas). Sirve para que confirme en su celu que los avisos llegan.
export async function sendTestPush(): Promise<PushResult> {
  if (!configureVapid()) {
    return { ok: false, error: "El servidor no tiene configuradas las VAPID keys." };
  }
  const supabase = await createClient();
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth");
  if (error) return { ok: false, error: error.message };
  if (!subs || subs.length === 0) {
    return { ok: false, error: "No tenés avisos activados en este dispositivo." };
  }

  const payload = JSON.stringify({
    title: "Pan y Queso ⚽",
    body: "¡Los avisos están funcionando!",
    url: "/mi-perfil",
    tag: "test-push",
  });

  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      sent++;
    } catch (e) {
      // 404/410 = la suscripción ya no existe en el navegador: la limpiamos.
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await supabase.rpc("delete_push_subscription", { p_endpoint: s.endpoint });
      }
    }
  }

  return sent > 0 ? { ok: true, sent } : { ok: false, error: "No se pudo entregar el push." };
}
