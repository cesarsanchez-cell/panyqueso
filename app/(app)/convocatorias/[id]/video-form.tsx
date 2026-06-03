"use client";

import { useActionState } from "react";

import { saveMatchVideoUrl, type SaveVideoState } from "./video-actions";

type Props = {
  convocatoriaId: string;
  initialUrl: string | null;
};

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export function VideoForm({ convocatoriaId, initialUrl }: Props) {
  const [state, formAction, pending] = useActionState<SaveVideoState, FormData>(
    saveMatchVideoUrl,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="convocatoria_id" value={convocatoriaId} />

      <div>
        <label htmlFor="video_resumen_url" className="block text-xs font-medium text-neutral-700">
          Link del video (https://…). Dejalo vacío para quitarlo.
        </label>
        <input
          id="video_resumen_url"
          name="video_resumen_url"
          type="url"
          inputMode="url"
          placeholder="https://sportsreel.com.ar/…"
          defaultValue={initialUrl ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar link"}
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
        {state && "success" in state ? (
          <p
            role="status"
            aria-live="polite"
            className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          >
            {state.success}
          </p>
        ) : null}
      </div>
    </form>
  );
}
