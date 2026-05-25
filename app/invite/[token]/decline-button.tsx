"use client";

import { useRef, useState } from "react";

import { declineInvite } from "./actions";

export function DeclineButton({ token }: { token: string }) {
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex-1 rounded-md border border-neutral-300 bg-white px-4 py-3 text-base font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50"
      >
        No voy
      </button>
    );
  }

  return (
    <form ref={formRef} action={declineInvite} className="flex flex-1 flex-col gap-2">
      <input type="hidden" name="token" value={token} />
      <p className="text-center text-xs text-neutral-600">¿Confirmás que no vas?</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="flex-1 rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800"
        >
          Sí, no voy
        </button>
      </div>
    </form>
  );
}
