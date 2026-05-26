"use client";

import Link from "next/link";
import { useActionState } from "react";

import { closeAndCreateNext, type CicloState } from "./convocatoria-ciclo-actions";

type ConvRosterMember = {
  playerId: string | null;
  nombre: string;
  apodo: string | null;
  rol: "titular" | "suplente";
  orden: number | null;
  attendanceStatus: string;
  esInvitadoLibre: boolean;
};

type OpenConvocatoria = {
  id: string;
  fecha: string;
  cierre_at: string | null;
  invitedCount: number;
  confirmadosCount: number;
  declinadosCount: number;
  titulares: ConvRosterMember[];
  suplentes: ConvRosterMember[];
  declinados: ConvRosterMember[];
};

const DIA_LABEL = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

function formatFechaFull(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const dia = DIA_LABEL[d.getDay()];
  return `${dia} ${d.toLocaleDateString("es-AR", { day: "numeric", month: "long" })}`;
}

function formatCierre(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ConvocatoriaCiclo({
  grupoId,
  autoRenovar,
  open,
}: {
  grupoId: string;
  autoRenovar: boolean;
  open: OpenConvocatoria | null;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Ciclo de convocatorias
        </h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            autoRenovar
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
              : "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200"
          }`}
        >
          {autoRenovar ? "Auto-renovación activa" : "Manual"}
        </span>
      </div>

      {open ? (
        <OpenConvocatoriaCard grupoId={grupoId} open={open} />
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-neutral-700">
            No hay convocatoria abierta para este grupo.{" "}
            {autoRenovar
              ? "Cuando cierre la próxima se crea automáticamente."
              : "El grupo está en modo manual."}
          </p>
          <Link
            href={`/convocatorias/nueva?grupo=${grupoId}`}
            className="inline-block rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800"
          >
            Crear convocatoria
          </Link>
        </div>
      )}
    </section>
  );
}

function OpenConvocatoriaCard({ grupoId, open }: { grupoId: string; open: OpenConvocatoria }) {
  const [state, formAction, pending] = useActionState<CicloState, FormData>(
    closeAndCreateNext,
    null,
  );

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
        <p className="text-sm font-semibold text-neutral-900">{formatFechaFull(open.fecha)}</p>
        <p className="mt-1 text-xs text-neutral-500">
          Cierre estimado: {formatCierre(open.cierre_at)}
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-neutral-700">
          <span>En la convocatoria: {open.invitedCount}</span>
          <span className="text-emerald-700">Confirmados: {open.confirmadosCount}</span>
          <span className="text-red-700">Declinados: {open.declinadosCount}</span>
        </div>
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Titulares ({open.titulares.length})
          </h3>
          {open.titulares.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-500">Sin titulares.</p>
          ) : (
            <ol className="mt-2 space-y-1">
              {open.titulares.map((m, i) => (
                <li
                  key={m.playerId ?? `libre-${i}`}
                  className="flex items-center gap-2 rounded px-2 py-1 text-sm text-neutral-800"
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700">
                    {i + 1}
                  </span>
                  <span>
                    {m.nombre}
                    {m.apodo ? (
                      <span className="ml-1 text-xs text-neutral-500">({m.apodo})</span>
                    ) : null}
                    {m.esInvitadoLibre ? (
                      <span className="ml-1 text-xs text-neutral-500">(invitado)</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Cola de suplentes ({open.suplentes.length})
          </h3>
          {open.suplentes.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-500">Sin suplentes.</p>
          ) : (
            <ol className="mt-2 space-y-1">
              {open.suplentes.map((m, i) => (
                <li
                  key={m.playerId ?? `libre-${i}`}
                  className="flex items-center gap-2 rounded px-2 py-1 text-sm text-neutral-800"
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-700">
                    {m.orden ?? "?"}
                  </span>
                  <span>
                    {m.nombre}
                    {m.apodo ? (
                      <span className="ml-1 text-xs text-neutral-500">({m.apodo})</span>
                    ) : null}
                    {m.esInvitadoLibre ? (
                      <span className="ml-1 text-xs text-neutral-500">(invitado)</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {open.declinados.length > 0 ? (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer font-medium text-neutral-500 hover:text-neutral-700">
            Se bajaron de este partido ({open.declinados.length})
          </summary>
          <ul className="mt-2 space-y-1 text-neutral-700">
            {open.declinados.map((m, i) => (
              <li key={m.playerId ?? `libre-${i}`} className="rounded px-2 py-0.5">
                {m.nombre}
                {m.apodo ? <span className="ml-1 text-neutral-500">({m.apodo})</span> : null}
                {m.esInvitadoLibre ? (
                  <span className="ml-1 text-neutral-500">(invitado)</span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-medium text-neutral-500 hover:text-neutral-700">
          Simular cierre manual (test)
        </summary>
        <div className="mt-2 space-y-2">
          <p className="text-xs text-neutral-500">
            Útil para probar el flujo sin esperar al cron. Cierra esta convocatoria y crea la
            siguiente +7 días con los titulares actuales del grupo.
          </p>
          <form action={formAction}>
            <input type="hidden" name="grupo_id" value={grupoId} />
            <input type="hidden" name="convocatoria_id" value={open.id} />
            <button
              type="submit"
              disabled={pending}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Cerrando…" : "Cerrar y crear siguiente"}
            </button>
          </form>
        </div>
      </details>

      {state && "error" in state ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.error}
        </p>
      ) : null}
      {state && "success" in state ? (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          {state.success}
        </p>
      ) : null}
    </div>
  );
}
