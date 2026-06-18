"use client";

import { useActionState, useState } from "react";

import { leaveGrupo, type OneClickState } from "./actions";

type Props = {
  grupoId: string;
  grupoNombre: string;
};

export function LeaveGrupoButton({ grupoId, grupoNombre }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState<OneClickState, FormData>(leaveGrupo, null);

  if (state && "success" in state) {
    return (
      <p
        role="status"
        aria-live="polite"
        className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
      >
        {state.success}
      </p>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-neutral-500 underline transition hover:text-red-700"
      >
        Bajarme del grupo
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="grupo_id" value={grupoId} />
      <p className="text-xs text-neutral-600">
        ¿Seguro que querés bajarte de <strong>{grupoNombre}</strong>? Para volver a entrar lo tiene
        que hacer el coordinador/admin.
      </p>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Bajándote…" : "Sí, bajarme"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50"
        >
          Cancelar
        </button>
      </div>
      {state && "error" in state ? (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
