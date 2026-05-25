"use client";

import { useActionState, useState } from "react";

import { resetPlayerPassword, type ResetPlayerPasswordState } from "./actions";

type Props = {
  playerId: string;
  playerNombre: string;
};

function buildWhatsAppLink(phone: string | null, message: string): string | null {
  if (!phone) return null;
  const clean = phone.replace(/[^\d]/g, "");
  if (!clean) return null;
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

export function AdminResetPassword({ playerId, playerNombre }: Props) {
  const [state, formAction, pending] = useActionState<ResetPlayerPasswordState, FormData>(
    resetPlayerPassword,
    null,
  );
  const [copied, setCopied] = useState(false);

  const success = state && "tempPassword" in state ? state : null;
  const error = state && "error" in state ? state : null;

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // navigator.clipboard puede faltar en contextos no seguros (http). El
      // admin igual puede seleccionar y copiar manualmente.
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Resetear contraseña
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        Generá una contraseña temporal y pasásela al jugador por WhatsApp. Se muestra una sola vez.
      </p>

      <form action={formAction} className="mt-3">
        <input type="hidden" name="player_id" value={playerId} />
        <button
          type="submit"
          disabled={pending || Boolean(success)}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Generando…" : success ? "Contraseña generada" : "Generar contraseña temporal"}
        </button>
      </form>

      {error ? (
        <p
          role="alert"
          aria-live="polite"
          className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error.error}
        </p>
      ) : null}

      {success ? (
        <div className="mt-3 space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm font-medium text-emerald-900">
            Contraseña nueva generada. Copiala y pasásela al jugador por WhatsApp.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 select-all rounded-md border border-emerald-300 bg-white px-3 py-2 font-mono text-base text-neutral-900">
              {success.tempPassword}
            </code>
            <button
              type="button"
              onClick={() => copyToClipboard(success.tempPassword)}
              className="rounded-md border border-emerald-300 bg-white px-3 py-2 text-xs font-medium text-emerald-900 shadow-sm transition hover:bg-emerald-100"
            >
              {copied ? "Copiado!" : "Copiar"}
            </button>
          </div>

          {success.phone ? (
            (() => {
              const message = `Hola ${playerNombre}, tu contraseña temporal para Futbol de los martes es: ${success.tempPassword}\n\nEntrá a la app con tu celular y esa contraseña, después cambiala desde tu perfil.`;
              const link = buildWhatsAppLink(success.phone, message);
              if (!link) return null;
              return (
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  Abrir WhatsApp con el mensaje listo
                </a>
              );
            })()
          ) : (
            <p className="text-xs text-emerald-900">
              El jugador no tiene celular cargado. Copiá la contraseña y mandásela por el canal que
              prefieras.
            </p>
          )}

          <p className="text-xs text-emerald-900">
            La contraseña ya quedó aplicada en la cuenta del jugador. Esta pantalla no la guarda; si
            refrescás, no la podés volver a ver.
          </p>
        </div>
      ) : null}
    </section>
  );
}
