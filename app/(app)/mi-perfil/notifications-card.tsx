"use client";

import { useEffect, useState } from "react";

import { deletePushSubscription, savePushSubscription, sendTestPush } from "@/lib/push/actions";

// Convierte la VAPID public key (base64url) al formato que pide pushManager.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

type State = "loading" | "unsupported" | "needs-install" | "default" | "denied" | "subscribed";

// Recuerda si el jugador tocó "Ahora no", para no insistir en cada visita.
const DISMISS_KEY = "pq_push_dismissed";

export function NotificationsCard() {
  const [state, setState] = useState<State>("loading");
  const [isIOS, setIsIOS] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");

    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua);
    setIsIOS(ios);

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    const supported =
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

    // iOS solo soporta push con la app instalada (agregada a inicio).
    if (ios && !standalone) {
      setState("needs-install");
      return;
    }
    if (!supported) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const existing = reg ? await reg.pushManager.getSubscription() : null;
        setState(existing && Notification.permission === "granted" ? "subscribed" : "default");
      } catch {
        setState("default");
      }
    })();
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "default");
        setMsg("Hace falta el permiso de notificaciones para avisarte.");
        return;
      }

      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        setMsg("Todavía falta configurar el servidor. Avisá al organizador.");
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const json = sub.toJSON();
      const res = await savePushSubscription({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        userAgent: navigator.userAgent,
      });
      if (!res.ok) {
        setMsg(res.error || "No se pudo guardar la suscripción.");
        return;
      }
      setState("subscribed");
      setMsg("¡Listo! Te avisamos cuando se libere un lugar.");
    } catch (e) {
      setMsg((e as Error).message || "No se pudieron activar los avisos.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("default");
      setMsg("Avisos desactivados.");
    } catch (e) {
      setMsg((e as Error).message || "No se pudo desactivar.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    const res = await sendTestPush();
    setMsg(res.ok ? "Te mandamos un push de prueba 👀" : res.error || "No se pudo enviar.");
    setBusy(false);
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  function restore() {
    localStorage.removeItem(DISMISS_KEY);
    setDismissed(false);
  }

  // Mientras carga no mostramos nada (evita parpadeo).
  if (state === "loading") return null;

  // El que dijo "Ahora no" y todavía no activó: solo un acceso chico, sin insistir.
  if (state === "default" && dismissed) {
    return (
      <button
        type="button"
        onClick={restore}
        className="text-xs font-medium text-emerald-700 underline transition hover:text-emerald-900"
      >
        🔔 Activar avisos del partido
      </button>
    );
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Avisos del partido
      </h2>
      <p className="mt-1 text-sm text-neutral-600">
        Activá las notificaciones y te avisamos al toque cuando se libere un lugar, sin estar
        pendiente del grupo.
      </p>

      <div className="mt-3">
        {state === "needs-install" ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {isIOS ? (
              <>
                <p className="font-medium">
                  Para recibir avisos en iPhone, agregá la app a inicio:
                </p>
                <ol className="mt-1 list-decimal pl-5 text-xs">
                  <li>Abrí esta página en Safari.</li>
                  <li>
                    Tocá <strong>Compartir</strong> (el cuadradito con la flecha ↑).
                  </li>
                  <li>
                    Elegí <strong>&ldquo;Agregar a inicio&rdquo;</strong>.
                  </li>
                  <li>Abrí la app desde el ícono nuevo y volvé acá.</li>
                </ol>
              </>
            ) : (
              <p>Agregá la app a la pantalla de inicio para poder recibir avisos.</p>
            )}
          </div>
        ) : null}

        {state === "unsupported" ? (
          <p className="text-sm text-neutral-500">
            Este navegador no soporta notificaciones. Probá desde Chrome (Android) o agregando la
            app a inicio.
          </p>
        ) : null}

        {state === "denied" ? (
          <p className="text-sm text-red-700">
            Bloqueaste las notificaciones. Habilitalas desde la configuración del navegador para
            este sitio y volvé a intentar.
          </p>
        ) : null}

        {state === "default" ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={enable}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Activando…" : "🔔 Activar avisos"}
            </button>
            <button
              type="button"
              onClick={dismiss}
              disabled={busy}
              className="rounded-md px-2 py-1.5 text-xs text-neutral-500 underline transition hover:text-neutral-700 disabled:opacity-60"
            >
              Ahora no
            </button>
          </div>
        ) : null}

        {state === "subscribed" ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
              ✅ Avisos activados
            </span>
            <button
              type="button"
              onClick={test}
              disabled={busy}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:opacity-60"
            >
              Probar
            </button>
            <button
              type="button"
              onClick={disable}
              disabled={busy}
              className="rounded-md px-2 py-1.5 text-xs text-neutral-500 underline transition hover:text-neutral-700 disabled:opacity-60"
            >
              Desactivar
            </button>
          </div>
        ) : null}

        {msg ? <p className="mt-2 text-xs text-neutral-600">{msg}</p> : null}
      </div>
    </section>
  );
}
