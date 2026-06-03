"use client";

import { type FormEvent, useActionState, useRef, useState } from "react";

import { resizeImage } from "@/lib/images/resize";

import { uploadPlayerPhoto, type AdminPhotoState } from "./photo-actions";

type Props = {
  playerId: string;
  currentUrl: string | null;
  nombre: string;
};

function initials(nombre: string): string {
  return (
    nombre
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function AdminPhotoForm({ playerId, currentUrl, nombre }: Props) {
  const [state, formAction, pending] = useActionState<AdminPhotoState, FormData>(
    uploadPlayerPhoto,
    null,
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const shown = preview ?? currentUrl;
  const working = pending || busy;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    const fd = new FormData();
    fd.set("player_id", playerId);
    if (file) {
      setBusy(true);
      const optimized = await resizeImage(file).catch(() => file);
      setBusy(false);
      fd.set("foto", optimized);
    }
    formAction(fd);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-4">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-neutral-100 ring-1 ring-neutral-200">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="Foto del jugador" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-neutral-400">
            {initials(nombre)}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <input
          ref={inputRef}
          type="file"
          name="foto"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
          className="block text-sm text-neutral-700 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-neutral-700"
        />
        <p className="text-xs text-neutral-500">JPG, PNG o WEBP. Se ajusta sola.</p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={working}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {working ? "Subiendo…" : "Guardar foto"}
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
      </div>
    </form>
  );
}
