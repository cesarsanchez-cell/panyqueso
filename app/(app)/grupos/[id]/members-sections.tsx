"use client";

import { useMemo, useState } from "react";

import { RemoveMemberForm } from "./membership-forms";

type Member = {
  id: string;
  joined_at: string;
  player: {
    id: string;
    nombre: string;
    apodo: string | null;
  } | null;
};

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function matchesQuery(m: Member, q: string): boolean {
  if (!q) return true;
  const p = m.player;
  if (!p) return false;
  if (normalize(p.nombre).includes(q)) return true;
  if (p.apodo && normalize(p.apodo).includes(q)) return true;
  return false;
}

export function MembersSections({
  miembros,
  cupoTitulares,
}: {
  miembros: Member[];
  cupoTitulares: number;
}) {
  const [query, setQuery] = useState("");
  const q = normalize(query.trim());

  // Orden de alta inmutable (lo da el server). El primero al final del array
  // ya quedo primero por el order by joined_at asc.
  const ordenados = useMemo(() => miembros, [miembros]);
  const filtrados = useMemo(() => ordenados.filter((m) => matchesQuery(m, q)), [ordenados, q]);

  return (
    <div className="space-y-4">
      <input
        type="search"
        placeholder="Buscar miembro por nombre o apodo…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
      />

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Miembros del grupo
          </h2>
          <p className="text-sm text-neutral-700">
            {q ? `${filtrados.length} de ${miembros.length}` : `${miembros.length} en total`}
          </p>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Orden de alta. Los primeros {cupoTitulares} entran como titulares en cada convocatoria; el
          resto como suplentes.
        </p>
        {miembros.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Sin miembros todavía.</p>
        ) : filtrados.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Ningún miembro coincide con la búsqueda.</p>
        ) : (
          <ol className="mt-3 divide-y divide-neutral-100">
            {filtrados.map((m) => {
              const posicionReal = ordenados.findIndex((x) => x.id === m.id) + 1;
              const esTitular = posicionReal <= cupoTitulares;
              return (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="flex items-center gap-3">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ring-1 ${
                        esTitular
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : "bg-amber-50 text-amber-700 ring-amber-200"
                      }`}
                      title={esTitular ? "Entraría como titular" : "Entraría como suplente"}
                    >
                      {posicionReal}
                    </span>
                    <span className="text-sm font-medium text-neutral-900">
                      {m.player?.nombre ?? "—"}
                      {m.player?.apodo ? (
                        <span className="ml-2 text-xs font-normal text-neutral-500">
                          ({m.player.apodo})
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <RemoveMemberForm membresiaId={m.id} />
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
