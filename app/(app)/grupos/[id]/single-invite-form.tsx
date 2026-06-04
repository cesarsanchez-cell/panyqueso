"use client";

import { useActionState, useState } from "react";

import { createGroupInvitation, type CreateGroupInviteState } from "../actions";
import { WhatsAppInviteButton } from "../../_components/whatsapp-invite-button";

const labelClass = "block text-sm font-medium text-neutral-800";
const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

function buildMessage(nombre: string, link: string): string {
  return `Hola ${nombre}, te invito al grupo. Confirmá tu lugar y completá tus datos acá:\n${link}`;
}

export function SingleInviteForm({ grupoId }: { grupoId: string }) {
  const [state, formAction, pending] = useActionState<CreateGroupInviteState, FormData>(
    createGroupInvitation,
    null,
  );

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="grupo_id" value={grupoId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="single-invite-phone" className={labelClass}>
              Celular
            </label>
            <input
              id="single-invite-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              required
              placeholder="1155551234"
              className={`${inputClass} font-mono`}
            />
            <p className="mt-1 text-xs text-neutral-500">10 dígitos (sin 0 ni 15).</p>
          </div>
          <div>
            <label htmlFor="single-invite-nombre" className={labelClass}>
              Nombre
            </label>
            <input
              id="single-invite-nombre"
              name="nombre"
              type="text"
              required
              maxLength={80}
              placeholder="Juan Pérez"
              className={inputClass}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Generando…" : "Generar invitación"}
          </button>
          {state && "error" in state ? (
            <p
              role="alert"
              aria-live="polite"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {state.error}
            </p>
          ) : null}
        </div>
      </form>

      {state && "ok" in state ? <InviteCreatedBox invite={state} /> : null}
    </div>
  );
}

function InviteCreatedBox({ invite }: { invite: { phone: string; nombre: string; link: string } }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const message = buildMessage(invite.nombre, invite.link);
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      try {
        await navigator.clipboard.writeText(invite.link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // ignore
      }
    }
  }

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
      <p className="text-xs font-medium">
        Invitación creada para <span className="font-semibold">{invite.nombre}</span>. Mandásela:
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <WhatsAppInviteButton
          phone={invite.phone}
          message={buildMessage(invite.nombre, invite.link)}
        />
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
        >
          {copied ? "¡Copiado!" : "Copiar mensaje"}
        </button>
      </div>
    </div>
  );
}
