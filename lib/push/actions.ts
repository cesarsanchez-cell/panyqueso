"use server";

import webpush from "web-push";

import { requireUser } from "@/lib/auth/require-role";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export type PushResult = { ok: true; sent?: number } | { ok: false; error: string };

// Formatea una fecha 'yyyy-mm-dd' como 'dd/mm' sin pasar por Date (evita líos
// de zona horaria con fechas sin hora).
function fechaCorta(fecha: string): string {
  const [, m, d] = fecha.split("-");
  return d && m ? `${d}/${m}` : fecha;
}

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

// Aviso automático de la Fase 2: cuando un titular se baja y NO había suplente
// para promover, queda un lugar de titular libre. Notificamos al resto del grupo
// (los que NO son titulares ahora) para que alguien lo tome, sin que nadie tenga
// que avisar a mano por WhatsApp.
//
// Es best-effort: nunca lanza. Si las VAPID no están o algo falla, devuelve sin
// romper la acción de bajarse. Corre con service-role para leer las
// suscripciones de todos los candidatos (RLS solo deja ver las propias) sin
// exponer secretos al cliente.
export async function notifyOpenSpot(convocatoriaId: string): Promise<PushResult> {
  try {
    if (!configureVapid()) return { ok: true, sent: 0 };

    const ctx = await requireUser();
    const admin = createServiceClient();

    // Jugador que acaba de bajarse: lo excluimos del aviso.
    const { data: actor } = await admin
      .from("players")
      .select("id")
      .eq("auth_user_id", ctx.userId)
      .maybeSingle();
    const actorId = actor?.id ?? null;

    // La convocatoria tiene que estar abierta y ser de un grupo.
    const { data: conv } = await admin
      .from("convocatorias")
      .select("id, status, grupo_id, fecha")
      .eq("id", convocatoriaId)
      .maybeSingle();
    if (!conv || conv.status !== "abierta" || !conv.grupo_id) return { ok: true, sent: 0 };

    const { data: grupo } = await admin
      .from("grupos")
      .select("cupo_titulares")
      .eq("id", conv.grupo_id)
      .maybeSingle();
    if (!grupo) return { ok: true, sent: 0 };

    // ¿Quedó realmente un lugar de titular libre? (titulares activos < cupo).
    // Si no, no hay nada que avisar (p. ej. se bajó un suplente, o ya se
    // promovió a alguien).
    const { count: titularesCount } = await admin
      .from("convocatoria_players")
      .select("id", { count: "exact", head: true })
      .eq("convocatoria_id", convocatoriaId)
      .eq("rol_en_convocatoria", "titular")
      .neq("attendance_status", "declinado");
    if ((titularesCount ?? 0) >= grupo.cupo_titulares) return { ok: true, sent: 0 };

    // Candidatos: miembros activos del grupo que hoy NO son titular activo en
    // esta convocatoria (incluye a los que se habían bajado: pueden volver).
    const { data: members } = await admin
      .from("grupo_membresias")
      .select("player_id")
      .eq("grupo_id", conv.grupo_id)
      .eq("status", "activo");
    const memberIds = (members ?? []).map((m) => m.player_id);

    const { data: titulares } = await admin
      .from("convocatoria_players")
      .select("player_id")
      .eq("convocatoria_id", convocatoriaId)
      .eq("rol_en_convocatoria", "titular")
      .neq("attendance_status", "declinado");
    const titularesIds = new Set((titulares ?? []).map((t) => t.player_id));

    const targetIds = memberIds.filter((id) => id !== actorId && !titularesIds.has(id));
    if (targetIds.length === 0) return { ok: true, sent: 0 };

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .in("player_id", targetIds);
    if (!subs || subs.length === 0) return { ok: true, sent: 0 };

    const payload = JSON.stringify({
      title: "¡Se liberó un lugar! ⚽",
      body: `Hay un lugar para el partido del ${fechaCorta(conv.fecha)}. Entrá y anotate antes de que lo tomen.`,
      url: "/mi-perfil",
      tag: `open-spot-${convocatoriaId}`,
    });

    const results = await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          return true;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) {
            await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          }
          return false;
        }
      }),
    );
    const sent = results.filter((r) => r.status === "fulfilled" && r.value).length;

    return { ok: true, sent };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
