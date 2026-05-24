"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] uncaught error:", error);
  }, [error]);

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6">
      <h2 className="text-base font-semibold text-red-900">Algo salió mal</h2>
      <p className="mt-2 text-sm text-red-800">
        Ocurrió un error inesperado al cargar la página. Probá reintentar; si el problema sigue,
        avisá al admin.
      </p>
      {error.digest ? (
        <p className="mt-2 text-xs text-red-700">
          Código de error: <code className="font-mono">{error.digest}</code>
        </p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
      >
        Reintentar
      </button>
    </div>
  );
}
