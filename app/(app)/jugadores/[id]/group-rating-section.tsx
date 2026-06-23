"use client";

import { useState } from "react";

import { GroupRatingEditor, type GroupRatingInitial } from "./group-rating-editor";

export type GroupRatingEntry = {
  grupoId: string;
  grupoNombre: string;
  veedorActivo: boolean;
  initial: GroupRatingInitial;
};

const selectClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 sm:w-auto";

// Una sola sección de "Ratings por grupo": primero se elige el grupo y recién
// ahí aparece su editor. Evita apilar una tarjeta por cada grupo.
export function GroupRatingSection({
  playerId,
  groups,
  preferredGrupoId,
}: {
  playerId: string;
  groups: GroupRatingEntry[];
  // Grupo a mostrar de entrada (viene del filtro del listado). Si no está entre
  // los grupos del jugador, cae al primero.
  preferredGrupoId?: string | null;
}) {
  const initialId =
    preferredGrupoId && groups.some((g) => g.grupoId === preferredGrupoId)
      ? preferredGrupoId
      : (groups[0]?.grupoId ?? "");
  const [selectedId, setSelectedId] = useState(initialId);
  const selected = groups.find((g) => g.grupoId === selectedId) ?? groups[0];

  if (!selected) return null;

  return (
    <div className="space-y-3">
      {groups.length > 1 ? (
        <label className="block text-xs font-medium text-neutral-600">
          Grupo
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className={selectClass}
          >
            {groups.map((g) => (
              <option key={g.grupoId} value={g.grupoId}>
                {g.grupoNombre}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <GroupRatingEditor
        key={selected.grupoId}
        playerId={playerId}
        grupoId={selected.grupoId}
        grupoNombre={selected.grupoNombre}
        veedorActivo={selected.veedorActivo}
        initial={selected.initial}
      />
    </div>
  );
}
