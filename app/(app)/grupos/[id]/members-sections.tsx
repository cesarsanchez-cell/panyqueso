"use client";

import { useMemo, useState } from "react";

import { DemoteForm, PromoteForm, RemoveMemberForm } from "./membership-forms";

type Member = {
  id: string;
  tipo: "titular" | "suplente";
  orden: number | null;
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
  titulares,
  suplentes,
  cupoTitulares,
}: {
  titulares: Member[];
  suplentes: Member[];
  cupoTitulares: number;
}) {
  const [query, setQuery] = useState("");
  const q = normalize(query.trim());

  // Titulares ordenados alfabeticamente (el orden FIFO solo aplica a
  // suplentes, en titulares no hay un "orden" significativo).
  const titularesAlfa = useMemo(() => {
    return [...titulares].sort((a, b) => {
      const an = a.player?.nombre ?? "";
      const bn = b.player?.nombre ?? "";
      return an.localeCompare(bn, "es");
    });
  }, [titulares]);

  const titularesFiltrados = useMemo(
    () => titularesAlfa.filter((m) => matchesQuery(m, q)),
    [titularesAlfa, q],
  );
  const suplentesFiltrados = useMemo(
    () => suplentes.filter((m) => matchesQuery(m, q)),
    [suplentes, q],
  );

  return (
    <div className="space-y-6">
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
            Titulares
          </h2>
          <p className="text-sm text-neutral-700">
            {q ? `${titularesFiltrados.length} de ${titulares.length}` : `${titulares.length}`} de{" "}
            {cupoTitulares}
          </p>
        </div>
        {titulares.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Sin titulares todavía.</p>
        ) : titularesFiltrados.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Ningún titular coincide con la búsqueda.</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100">
            {titularesFiltrados.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="text-sm font-medium text-neutral-900">
                  {m.player?.nombre ?? "—"}
                  {m.player?.apodo ? (
                    <span className="ml-2 text-xs font-normal text-neutral-500">
                      ({m.player.apodo})
                    </span>
                  ) : null}
                </span>
                <div className="flex items-center gap-2">
                  <DemoteForm membresiaId={m.id} />
                  <RemoveMemberForm membresiaId={m.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Cola de suplentes (FIFO)
          </h2>
          <p className="text-sm text-neutral-700">
            {q ? `${suplentesFiltrados.length} de ${suplentes.length}` : `${suplentes.length}`}
          </p>
        </div>
        {suplentes.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Sin suplentes en cola.</p>
        ) : suplentesFiltrados.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Ningún suplente coincide con la búsqueda.</p>
        ) : (
          <ol className="mt-3 divide-y divide-neutral-100">
            {suplentesFiltrados.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="flex items-center gap-3">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-700">
                    {m.orden ?? "?"}
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
                <div className="flex items-center gap-2">
                  <PromoteForm membresiaId={m.id} />
                  <RemoveMemberForm membresiaId={m.id} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
