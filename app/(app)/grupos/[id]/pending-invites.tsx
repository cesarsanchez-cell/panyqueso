"use client";

import { useState } from "react";

import { formatArLocal } from "@/lib/phone";

import { cancelInvitation } from "../actions";

export type PendingInvite = {
  id: string;
  phone: string;
  nombre: string;
  link: string;
  expiresAt: string;
};

export function PendingInvitesList({ invites }: { invites: PendingInvite[] }) {
  return (
    <ul className="mt-3 divide-y divide-neutral-100">
      {invites.map((inv) => (
        <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-neutral-900">{inv.nombre}</p>
            <p className="truncate text-xs text-neutral-500">
              {formatArLocal(inv.phone)} · vence {formatDate(inv.expiresAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CopyLinkButton invite={inv} />
            <form action={cancelInvitation}>
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
  );
}

function CopyLinkButton({ invite }: { invite: PendingInvite }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const message = `Hola ${invite.nombre}, te invito al grupo. Confirmá tu lugar y completá tus datos acá:\n${invite.link}`;
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
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
