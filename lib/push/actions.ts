"use server";

import webpush from "web-push";

import { requireUser } from "@/lib/auth/require-role";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export type PushResult = { ok: true; sent?: number } | { ok: false; error: string };

// Banca de suplentes que queremos mantener: si baja de esto, avisamos al grupo
// para que alguien se anote como suplente.
const SUPLENTES_OBJETIVO = 3;

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

// Aviso automático de la Fase 2: cuando alguien se baja, avisamos al grupo para
// mantener la lista llena, sin que nadie tenga que escribir al WhatsApp. Dos
// escenarios:
//   1. Se liberó un lugar de TITULAR (titulares activos < cupo, no había
//      suplente para promover): "¡Se liberó un lugar! anotate".
//   2. La banca de SUPLENTES bajó del objetivo (titulares llenos pero suplentes
//      activos < SUPLENTES_OBJETIVO): "Hay lugar entre los suplentes, anotate".
//
// En ambos casos el aviso va a los miembros activos del grupo que hoy NO son ni
// titular ni suplente en esta convocatoria (incluye a los que se habían bajado:
// pueden volver), excluyendo a quien generó la vacante.
//
// Se llama desde dos lugares:
//   - el jugador se baja ("No voy"): excluimos al jugador logueado (sesión).
//   - el admin saca a alguien: pasamos opts.excludePlayerId con el jugador
//     sacado, así no le mandamos "anotate" justo al que acaba de quitar.
//
// Es best-effort: nunca lanza. Si las VAPID no están o algo falla, devuelve sin
// romper la acción. Corre con service-role para leer las suscripciones de todos
// los candidatos (RLS solo deja ver las propias) sin exponer secretos al cliente.
export async function notifyOpenSpot(
  convocatoriaId: string,
  opts?: { excludePlayerId?: string },
): Promise<PushResult> {
  try {
    if (!configureVapid()) return { ok: true, sent: 0 };

    const ctx = await requireUser();
    const admin = createServiceClient();

    // A quién no avisarle: el jugador logueado (cuando se baja él mismo) y/o el
    // jugador que el admin acaba de sacar.
    const { data: actor } = await admin
      .from("players")
      .select("id")
      .eq("auth_user_id", ctx.userId)
      .maybeSingle();
    const excludedIds = new Set<string>();
    if (actor?.id) excludedIds.add(actor.id);
    if (opts?.excludePlayerId) excludedIds.add(opts.excludePlayerId);

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

    // Conteo del estado actual de la convocatoria (sin declinados).
    const { count: titularesCount } = await admin
      .from("convocatoria_players")
      .select("id", { count: "exact", head: true })
      .eq("convocatoria_id", convocatoriaId)
      .eq("rol_en_convocatoria", "titular")
      .neq("attendance_status", "declinado");
    const { count: suplentesCount } = await admin
      .from("convocatoria_players")
      .select("id", { count: "exact", head: true })
      .eq("convocatoria_id", convocatoriaId)
      .eq("rol_en_convocatoria", "suplente")
      .neq("attendance_status", "declinado");

    // Decidir qué avisar. Titular tiene prioridad (es el lugar que más urge).
    let kind: "titular" | "suplente" | null = null;
    if ((titularesCount ?? 0) < grupo.cupo_titulares) {
      kind = "titular";
    } else if ((suplentesCount ?? 0) < SUPLENTES_OBJETIVO) {
      kind = "suplente";
    }
    if (!kind) return { ok: true, sent: 0 };

    // Candidatos: miembros activos del grupo que hoy NO son ni titular ni
    // suplente activo en esta convocatoria (incluye a los que se habían bajado:
    // pueden volver). Excluimos al que acaba de bajarse.
    const { data: members } = await admin
      .from("grupo_membresias")
      .select("player_id")
      .eq("grupo_id", conv.grupo_id)
      .eq("status", "activo");
    const memberIds = (members ?? []).map((m) => m.player_id);

    const { data: enConv } = await admin
      .from("convocatoria_players")
      .select("player_id")
      .eq("convocatoria_id", convocatoriaId)
      .in("rol_en_convocatoria", ["titular", "suplente"])
      .neq("attendance_status", "declinado");
    const enConvIds = new Set((enConv ?? []).map((t) => t.player_id));

    const targetIds = memberIds.filter((id) => !excludedIds.has(id) && !enConvIds.has(id));
    if (targetIds.length === 0) return { ok: true, sent: 0 };

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .in("player_id", targetIds);
    if (!subs || subs.length === 0) return { ok: true, sent: 0 };

    const fecha = fechaCorta(conv.fecha);
    const payload = JSON.stringify(
      kind === "titular"
        ? {
            title: "¡Se liberó un lugar! ⚽",
            body: `Hay un lugar de titular para el partido del ${fecha}. Entrá y sumate antes de que lo tomen.`,
            url: "/mi-perfil",
            tag: `open-titular-${convocatoriaId}`,
          }
        : {
            title: "Hay lugar en la lista de espera ⚽",
            body: `Se liberó un lugar en la lista de espera para el partido del ${fecha}. Entrá y sumate.`,
            url: "/mi-perfil",
            tag: `open-suplente-${convocatoriaId}`,
          },
    );

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
