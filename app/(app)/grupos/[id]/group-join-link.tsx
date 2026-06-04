"use client";

import { useState } from "react";

import { disableGroupJoinLink, regenerateGroupJoinLink } from "../actions";

// Sección del "link único del grupo": un solo link reusable que el admin pega
// una vez en el grupo de WhatsApp. Cada jugador lo abre y se anota solo.
//
// El botón de WhatsApp acá NO apunta a un número (no hay destinatario fijo):
// usa el esquema share (wa.me/?text=) que abre WhatsApp para elegir a quién/
// qué grupo mandárselo, con el mensaje + link precargados.
export function GroupJoinLinkSection({
  grupoId,
  joinToken,
  origin,
  grupoNombre,
}: {
  grupoId: string;
  joinToken: string | null;
  origin: string;
  grupoNombre: string;
}) {
  const link = joinToken ? (origin ? `${origin}/g/${joinToken}` : `/g/${joinToken}`) : null;

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Link único del grupo
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        Un solo link para pegar una vez en el grupo de WhatsApp. Cualquiera que lo abra se anota
        solo (pone su celu y sus datos) y queda agregado al grupo. No necesitás conocer los números.
      </p>

      {link ? (
        <ActiveLink grupoId={grupoId} link={link} grupoNombre={grupoNombre} />
      ) : (
        <div className="mt-4">
          <form action={regenerateGroupJoinLink}>
            <input type="hidden" name="grupo_id" value={grupoId} />
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800"
            >
              Generar link
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

function ActiveLink({
  grupoId,
  link,
  grupoNombre,
}: {
  grupoId: string;
  link: string;
  grupoNombre: string;
}) {
  const [copied, setCopied] = useState(false);

  const message = `Te sumo al grupo ${grupoNombre} ⚽. Anotate y completá tus datos acá:\n${link}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(message)}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // ignore
      }
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2">
        <code className="block flex-1 truncate rounded bg-neutral-100 px-2 py-1.5 text-xs text-neutral-700">
          {link}
        </code>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
            <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.86 9.86 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" />
          </svg>
          Enviar por WhatsApp
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          {copied ? "¡Copiado!" : "Copiar mensaje"}
        </button>
        <form action={regenerateGroupJoinLink}>
          <input type="hidden" name="grupo_id" value={grupoId} />
          <button
            type="submit"
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            Regenerar
          </button>
        </form>
        <form action={disableGroupJoinLink}>
          <input type="hidden" name="grupo_id" value={grupoId} />
          <button
            type="submit"
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-red-50 hover:text-red-700"
          >
            Desactivar
          </button>
        </form>
      </div>

      <p className="text-xs text-neutral-500">
        Regenerar invalida el link anterior. Desactivar lo apaga del todo. El link deja de funcionar
        si archivás el grupo.
      </p>
    </div>
  );
}
