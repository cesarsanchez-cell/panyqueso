"use client";

import { useRouter } from "next/navigation";

type Grupo = { id: string; nombre: string };

// Selector de grupo para la lista de jugadores. Navega por querystring
// preservando los demás filtros (status, sin_calificar), que llegan por props
// desde el server. Server-driven: el page.tsx lee ?grupo=<id> y acota a los
// miembros activos de ese grupo.
export function GrupoFilter({
  grupos,
  value,
  status,
  sin,
}: {
  grupos: Grupo[];
  value: string | null;
  status: string | null;
  sin: boolean;
}) {
  const router = useRouter();

  if (grupos.length === 0) return null;

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (e.target.value) params.set("grupo", e.target.value);
    if (sin) params.set("sin_calificar", "1");
    const qs = params.toString();
    router.push(qs ? `/jugadores?${qs}` : "/jugadores");
  }

  return (
    <label className="flex items-center gap-2 text-sm text-neutral-600">
      <span className="shrink-0">Grupo</span>
      <select
        value={value ?? ""}
        onChange={onChange}
        aria-label="Filtrar por grupo"
        className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
      >
        <option value="">Todos los grupos</option>
        {grupos.map((g) => (
          <option key={g.id} value={g.id}>
            {g.nombre}
          </option>
        ))}
      </select>
    </label>
  );
}
