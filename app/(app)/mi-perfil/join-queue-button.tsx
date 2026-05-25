"use client";

import { useActionState } from "react";

import { joinSuplenteQueue, type OneClickState } from "./actions";

type Props = {
  grupoId: string;
  label: string;
};

export function JoinQueueButton({ grupoId, label }: Props) {
  const [state, formAction, pending] = useActionState<OneClickState, FormData>(
    joinSuplenteQueue,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="grupo_id" value={grupoId} />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md border border-neutral-900 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Anotándote…" : label}
      </button>
      {state && "error" in state ? (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
        >
          {state.error}
        </p>
      ) : null}
      {state && "success" in state ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
        >
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
