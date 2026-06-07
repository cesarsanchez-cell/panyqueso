"use client";

import { useActionState, useState } from "react";

import { formatArLocal } from "@/lib/phone";

import { invitePlayerToComplete, type InvitePlayerState } from "./actions";

type Props = {
  playerId: string;
  playerNombre: string;
  hasPhone: boolean;
};

function buildWhatsAppLink(phone: string | null, message: string): string | null {
  if (!phone) return null;
  const clean = phone.replace(/[^\d]/g, "");
  if (!clean) return null;
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

export function InviteToComplete({ playerId, playerNombre, hasPhone }: Props) {
  const [state, formAction, pending] = useActionState<InvitePlayerState, FormData>(
    invitePlayerToComplete,
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
      // navigator.clipboard puede faltar en http; el admin copia a mano.
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Invitar a completar sus datos
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        Le crea una cuenta a este jugador (vinculada a esta ficha) y te da una contraseña temporal
        para pasarle por WhatsApp. Después entra con su celular y completa su perfil (foto, club,
        etc.).
      </p>

      {!hasPhone ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Este jugador no tiene celular cargado. El celular es la clave de ingreso: agregalo en
          &ldquo;Editar jugador&rdquo; y después invitalo.
        </p>
      ) : (
        <form action={formAction} className="mt-3">
          <input type="hidden" name="player_id" value={playerId} />
          <button
            type="submit"
            disabled={pending || Boolean(success)}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Creando acceso…" : success ? "Acceso creado" : "Crear acceso e invitar"}
          </button>
        </form>
      )}

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
            Cuenta creada y vinculada. Copiá la contraseña y pasásela al jugador por WhatsApp.
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

          {(() => {
            const loginUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/login`;
            const message = `Hola ${playerNombre}, te sumamos a Pan y Queso ⚽\n\n1) Entrá acá 👉 ${loginUrl}\n2) Usuario: tu celular (${formatArLocal(success.phone)})\n3) Contraseña temporal: ${success.tempPassword}\n\nYa adentro: completá tu perfil (foto, equipo del que sos hincha, etc.) y cambiá la clave desde tu perfil. ¡Cualquier duda avisá! 🙌`;
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
          })()}

          <p className="text-xs text-emerald-900">
            La contraseña ya quedó aplicada. Esta pantalla no la guarda; si refrescás, no la podés
            volver a ver (después usás &ldquo;Resetear contraseña&rdquo;).
          </p>
        </div>
      ) : null}
    </section>
  );
}
