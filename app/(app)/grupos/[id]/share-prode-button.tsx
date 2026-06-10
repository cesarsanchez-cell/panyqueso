"use client";

import { useState } from "react";

// Comparte la imagen PNG de la tabla del Prode (ruta /grupos/<id>/prode-imagen).
// En celu usa el share sheet nativo (Web Share API con archivos) -> WhatsApp.
// En desktop cae a descargar el PNG para adjuntarlo. Mismo patrón que el de
// equipos.
export function ShareProdeButton({ grupoId, year }: { grupoId: string; year: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/grupos/${grupoId}/prode-imagen?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).trim();
        throw new Error(detail || "No se pudo generar la imagen. Reintentá.");
      }
      const blob = await res.blob();
      const file = new File([blob], "prode-pan-y-queso.png", { type: "image/png" });

      const nav = navigator as Navigator & {
        canShare?: (data: { files: File[] }) => boolean;
        share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>;
      };

      const isMobile =
        typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

      if (isMobile && nav.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({
          files: [file],
          title: "Tabla del Prode",
          text: `🔮 Tabla del Prode ${year} — Pan y Queso`,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message || "No se pudo compartir.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-800 shadow-sm transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Generando…" : "📲 Compartir tabla"}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
