"use client";

import { useActionState, useEffect, useRef } from "react";

import { updatePassword, type PerfilState } from "./actions";

export function PerfilForm() {
  const [state, formAction, pending] = useActionState<PerfilState, FormData>(updatePassword, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && "ok" in state && state.ok) {
      formRef.current?.reset();
    }
  }, [state]);

  const isOk = state && "ok" in state;
  const errorMsg = state && "error" in state ? state.error : null;

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm font-medium text-neutral-800">
          Nueva contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
        />
        <p className="text-xs text-neutral-500">Mínimo 8 caracteres.</p>
      </div>

      <div className="space-y-1">
        <label htmlFor="confirm" className="block text-sm font-medium text-neutral-800">
          Confirmar nueva contraseña
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Cambiar contraseña"}
      </button>

      {isOk ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
        >
          Contraseña actualizada.
        </p>
      ) : null}

      {errorMsg ? (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {errorMsg}
        </p>
      ) : null}
    </form>
  );
}
