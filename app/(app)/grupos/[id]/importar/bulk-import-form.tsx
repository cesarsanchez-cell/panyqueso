"use client";

import { useActionState, useState } from "react";

import { bulkCreateInvitations, type BulkImportState } from "./actions";

const labelClass = "block text-sm font-medium text-neutral-800";
const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export function BulkImportForm({ grupoId }: { grupoId: string }) {
  const [state, formAction, pending] = useActionState<BulkImportState, FormData>(
    bulkCreateInvitations,
    null,
  );

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="grupo_id" value={grupoId} />
        <div>
          <label htmlFor="entries" className={labelClass}>
            Lista
          </label>
          <textarea
            id="entries"
            name="entries"
            required
            rows={10}
            placeholder={"+5491155551234,Juan Pérez\n+5491155556789,Diego López"}
            className={`${inputClass} font-mono`}
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Generando…" : "Generar invitaciones"}
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

      {state && "aceptadas" in state ? <ImportResults state={state} /> : null}
    </div>
  );
}

function ImportResults({
  state,
}: {
  state: {
    aceptadas: { phone: string; nombre: string; link: string }[];
    salteadas: { linea: string; razon: string }[];
  };
}) {
  const { aceptadas, salteadas } = state;

  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Aceptadas ({aceptadas.length})
          </h3>
          {aceptadas.length > 0 ? <CopyAllButton aceptadas={aceptadas} /> : null}
        </div>
        {aceptadas.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No se generó ninguna invitación.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-100 rounded-md border border-neutral-200">
            {aceptadas.map((row) => (
              <li
                key={row.link}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">{row.nombre}</p>
                  <p className="truncate text-xs text-neutral-500">{row.phone}</p>
                </div>
                <CopyOneButton row={row} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {salteadas.length > 0 ? (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Salteadas ({salteadas.length})
          </h3>
          <ul className="mt-2 divide-y divide-neutral-100 rounded-md border border-amber-200 bg-amber-50">
            {salteadas.map((row, i) => (
              <li key={`${row.linea}-${i}`} className="px-3 py-2.5 text-sm">
                <p className="truncate font-mono text-xs text-neutral-700">{row.linea}</p>
                <p className="text-xs text-amber-800">{row.razon}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function buildMessage(nombre: string, link: string): string {
  return `Hola ${nombre}, te invito al grupo. Confirmá tu lugar y completá tus datos acá:\n${link}`;
}

function CopyOneButton({ row }: { row: { phone: string; nombre: string; link: string } }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildMessage(row.nombre, row.link));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: copy just the link.
      try {
        await navigator.clipboard.writeText(row.link);
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
      className="shrink-0 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
    >
      {copied ? "¡Copiado!" : "Copiar mensaje"}
    </button>
  );
}

function CopyAllButton({
  aceptadas,
}: {
  aceptadas: { phone: string; nombre: string; link: string }[];
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const text = aceptadas.map((row) => `${row.nombre} (${row.phone}): ${row.link}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
    >
      {copied ? "¡Copiado!" : "Copiar todos"}
    </button>
  );
}
