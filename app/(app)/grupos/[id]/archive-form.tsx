"use client";

import { archiveGrupo, unarchiveGrupo } from "../actions";

export function ArchiveGrupoForm({ grupoId, isActive }: { grupoId: string; isActive: boolean }) {
  return (
    <form action={isActive ? archiveGrupo : unarchiveGrupo}>
      <input type="hidden" name="id" value={grupoId} />
      <button
        type="submit"
        className={
          isActive
            ? "rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
            : "rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100"
        }
      >
        {isActive ? "Archivar grupo" : "Reactivar grupo"}
      </button>
    </form>
  );
}
