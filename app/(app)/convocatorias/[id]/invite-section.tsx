"use client";

import { useActionState, useState } from "react";

import {
  cancelConvocatoriaInvitation,
  createInvitation,
  type CreateInvitationState,
} from "./invite-actions";

export type PendingConvocatoriaInvite = {
  id: string;
  phone: string;
  nombre: string;
  link: string;
  expiresAt: string;
};

const labelClass = "block text-sm font-medium text-neutral-800";
const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export function InviteSection({
  convocatoriaId,
  invites,
  origin,
}: {
  convocatoriaId: string;
  invites: PendingConvocatoriaInvite[];
  origin: string;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Invitar nuevo jugador
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        Para jugadores que todavía no están registrados. Generá un link que puedas pegar en
        WhatsApp; cuando lo abren y aceptan, quedan agregados a esta convocatoria.
      </p>

      <InviteForm convocatoriaId={convocatoriaId} origin={origin} />

      <div className="mt-6 border-t border-neutral-100 pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Pendientes para este partido
          </h3>
          <p className="text-sm text-neutral-700">{invites.length}</p>
        </div>
        {invites.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            Sin invitaciones pendientes ligadas a esta convocatoria.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-100">
            {invites.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">{inv.nombre}</p>
                  <p className="truncate text-xs text-neutral-500">
                    {inv.phone} · vence {formatDate(inv.expiresAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <CopyLinkButton invite={inv} />
                  <form action={cancelConvocatoriaInvitation}>
                    <input type="hidden" name="invitation_id" value={inv.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-red-50 hover:text-red-700"
                    >
                      Cancelar
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function InviteForm({ convocatoriaId, origin }: { convocatoriaId: string; origin: string }) {
  const [state, formAction, pending] = useActionState<CreateInvitationState, FormData>(
    createInvitation,
    null,
  );

  const generatedLink = state && "token" in state ? `${origin}/invite/${state.token}` : null;

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <input type="hidden" name="convocatoria_id" value={convocatoriaId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="invite-phone" className={labelClass}>
            Teléfono
          </label>
          <input
            id="invite-phone"
            name="phone"
            type="tel"
            required
            placeholder="+5491155551234"
            className={`${inputClass} font-mono`}
          />
        </div>
        <div>
          <label htmlFor="invite-nombre" className={labelClass}>
            Nombre tentativo
          </label>
          <input
            id="invite-nombre"
            name="nombre"
            type="text"
            required
            maxLength={80}
            placeholder="Juan Pérez"
            className={inputClass}
          />
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          {state && "error" in state ? (
            <p
              role="alert"
              aria-live="polite"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {state.error}
            </p>
          ) : null}
          {generatedLink ? <GeneratedLinkBox link={generatedLink} /> : null}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Generando…" : "Generar invitación"}
        </button>
      </div>
    </form>
  );
}

function GeneratedLinkBox({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
      <p className="text-xs font-medium">Invitación creada.</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="block flex-1 truncate rounded bg-white px-2 py-1 text-xs text-neutral-700">
          {link}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md border border-emerald-300 bg-white px-3 py-1 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
        >
          {copied ? "¡Copiado!" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

function CopyLinkButton({ invite }: { invite: PendingConvocatoriaInvite }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const message = `Hola ${invite.nombre}, te invito al partido. Confirmá tu lugar y completá tus datos acá:\n${invite.link}`;
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
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
    >
      {copied ? "¡Copiado!" : "Copiar link"}
    </button>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
