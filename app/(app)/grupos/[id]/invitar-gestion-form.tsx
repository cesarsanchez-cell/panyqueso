"use client";

import { useActionState, useState } from "react";

import { formatArLocal } from "@/lib/phone";

import { type InvitarGestionState } from "./invitar-gestion-actions";

type Rol = "coordinador" | "veedor";

type Props = {
  rol: Rol;
  grupoId: string;
  grupoNombre: string;
  action: (prev: InvitarGestionState, formData: FormData) => Promise<InvitarGestionState>;
};

function buildWhatsAppLink(phone: string, message: string): string | null {
  const clean = phone.replace(/[^\d]/g, "");
  if (!clean) return null;
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

const ROL_LABEL: Record<Rol, string> = { coordinador: "coordinador", veedor: "veedor" };

// Invita a una persona SIN ficha de jugador a gestionar el grupo (coordinador o
// veedor): crea su cuenta por celular y te da la clave temporal para mandar por
// WhatsApp. Si ya tenía cuenta de gestión, la suma a este grupo (sin clave nueva).
// Entra con su celular, no ve la vista de jugador (no tiene ficha).
export function InvitarGestionForm({ rol, grupoId, grupoNombre, action }: Props) {
  const [state, formAction, pending] = useActionState<InvitarGestionState, FormData>(action, null);
  const [copied, setCopied] = useState(false);

  const success = state && "ok" in state ? state : null;
  const error = state && "error" in state ? state : null;
  const rolLabel = ROL_LABEL[rol];

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // navigator.clipboard puede faltar en http; se copia a mano.
    }
  }

  const tempPassword = success?.tempPassword ?? null;

  return (
    <div className="mt-4 border-t border-neutral-100 pt-4">
      <p className="text-xs font-medium text-neutral-700">
        ¿Es alguien que no juega? Invitalo por WhatsApp
      </p>
      <p className="mt-1 text-xs text-neutral-500">
        Le crea una cuenta de {rolLabel} (sin ficha de jugador) y te da una clave temporal para
        pasarle. Entra con su celular y gestiona este grupo.
      </p>

      {success && tempPassword ? (
        <div className="mt-3 space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm font-medium text-emerald-900">
            Cuenta de {rolLabel} lista para {success.nombre}. Copiá la clave y pasásela por
            WhatsApp.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 select-all rounded-md border border-emerald-300 bg-white px-3 py-2 font-mono text-base text-neutral-900">
              {tempPassword}
            </code>
            <button
              type="button"
              onClick={() => copyToClipboard(tempPassword)}
              className="rounded-md border border-emerald-300 bg-white px-3 py-2 text-xs font-medium text-emerald-900 shadow-sm transition hover:bg-emerald-100"
            >
              {copied ? "Copiado!" : "Copiar"}
            </button>
          </div>

          {(() => {
            const loginUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/login`;
            const message = `Hola ${success.nombre}, te sumamos como ${rolLabel} de ${grupoNombre} en Pan y Queso ⚽\n\n1) Entrá acá 👉 ${loginUrl}\n2) Usuario: tu celular (${formatArLocal(success.phone)})\n3) Contraseña temporal: ${tempPassword}\n\nYa adentro podés gestionar el grupo y cambiar la clave desde tu perfil. ¡Cualquier duda avisá! 🙌`;
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
            La clave ya quedó aplicada. Esta pantalla no la guarda; si refrescás, no la volvés a
            ver.
          </p>
        </div>
      ) : success ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        >
          {success.nombre} ya tenía cuenta: lo sumaste como {rolLabel} de {grupoNombre}. Entra con
          su celular de siempre.
        </p>
      ) : (
        <form action={formAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <input type="hidden" name="grupo_id" value={grupoId} />
          <div className="min-w-0 flex-1">
            <label htmlFor={`${rol}_nombre`} className="block text-xs font-medium text-neutral-700">
              Nombre
            </label>
            <input
              id={`${rol}_nombre`}
              name="nombre"
              type="text"
              required
              maxLength={80}
              placeholder="Nombre y apellido"
              autoComplete="off"
              className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
          </div>
          <div className="min-w-0 flex-1">
            <label
              htmlFor={`${rol}_celular`}
              className="block text-xs font-medium text-neutral-700"
            >
              Celular
            </label>
            <input
              id={`${rol}_celular`}
              name="celular"
              type="tel"
              required
              placeholder="11 2345 6789"
              autoComplete="off"
              className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor={`${rol}_email`} className="block text-xs font-medium text-neutral-700">
              Email <span className="font-normal text-neutral-400">(opcional)</span>
            </label>
            <input
              id={`${rol}_email`}
              name="email"
              type="email"
              placeholder="contacto@email.com"
              autoComplete="off"
              className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Creando…" : "Invitar"}
          </button>
        </form>
      )}

      {error ? (
        <p
          role="alert"
          aria-live="polite"
          className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800"
        >
          {error.error}
        </p>
      ) : null}
    </div>
  );
}
