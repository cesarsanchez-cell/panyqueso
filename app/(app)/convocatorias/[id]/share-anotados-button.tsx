"use client";

import { useState } from "react";

// Comparte la imagen PNG de los anotados (ruta /convocatorias/<id>/anotados).
// En celu usa el share sheet nativo (Web Share API con archivos) -> WhatsApp.
// En desktop (sin Web Share de archivos) cae a descargar el PNG para adjuntarlo.
export function ShareAnotadosButton({ convocatoriaId }: { convocatoriaId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/convocatorias/${convocatoriaId}/anotados?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("No se pudo generar la imagen. Reintentá.");
      const blob = await res.blob();
      const file = new File([blob], "anotados-pan-y-queso.png", { type: "image/png" });

      const nav = navigator as Navigator & {
        canShare?: (data: { files: File[] }) => boolean;
        share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>;
      };

      // En celu (pointer grueso) usamos el share sheet nativo -> WhatsApp va de
      // una. En compu el "compartir" de Windows solo ofrece "Copiar" (que
      // WhatsApp Web no pega bien), asi que mejor descargamos el archivo.
      const isMobile =
        typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

      if (isMobile && nav.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({
          files: [file],
          title: "Anotados",
          text: "¿Quién se anota? ⚽ Faltan lugares — entrá a panyqueso.ar",
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
      // El usuario cancelando el share dispara AbortError: no es un error real.
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
        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Generando…" : "📲 Compartir anotados"}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
