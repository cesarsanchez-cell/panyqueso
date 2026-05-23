"use client";

import { useActionState } from "react";

import { requestStatusChange, type StatusChangeAction, type StatusChangeState } from "./actions";

type Props = {
  playerId: string;
  action: StatusChangeAction;
};

const LABEL: Record<StatusChangeAction, { title: string; button: string; description: string }> = {
  deactivate_player: {
    title: "Desactivar jugador",
    button: "Desactivar",
    description: "Crea una solicitud para que el veedor desactive este jugador.",
  },
  reactivate_player: {
    title: "Reactivar jugador",
    button: "Reactivar",
    description: "Crea una solicitud para que el veedor reactive este jugador.",
  },
};

export function StatusChangeForm({ playerId, action }: Props) {
  const [state, formAction, pending] = useActionState<StatusChangeState, FormData>(
    requestStatusChange,
    null,
  );
  const labels = LABEL[action];

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {labels.title}
      </h2>
      <p className="mt-1 text-sm text-neutral-600">{labels.description}</p>

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="player_id" value={playerId} />
        <input type="hidden" name="action_type" value={action} />

        <div>
          <label
            htmlFor={`reason-${action}`}
            className="block text-sm font-medium text-neutral-800"
          >
            Motivo
          </label>
          <textarea
            id={`reason-${action}`}
            name="reason"
            rows={2}
            required
            className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            placeholder={
              action === "deactivate_player"
                ? "Ej: dejó de venir hace varios meses."
                : "Ej: volvió tras la lesión, está jugando otra vez."
            }
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          {state?.error ? (
            <p
              role="alert"
              aria-live="polite"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {state.error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Enviando…" : labels.button}
          </button>
        </div>
      </form>
    </section>
  );
}
