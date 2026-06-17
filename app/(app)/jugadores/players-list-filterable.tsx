"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ClubCrest } from "@/components/club-crest";
import { playerLabel } from "@/lib/players/label";
import type { Database } from "@/lib/supabase/database.types";

import { PlayerAvatar } from "../player-avatar";

type PlayerStatus = Database["public"]["Enums"]["player_status"];
type PlayerRoleField = Database["public"]["Enums"]["player_role_field"];

type Player = {
  id: string;
  nombre: string;
  apodo: string | null;
  edad: number;
  status: PlayerStatus;
  role_field: PlayerRoleField;
  avatar_url: string | null;
  club_id: string | null;
  sinCalificar?: boolean;
};

const STATUS_LABEL: Record<PlayerStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  inactive: "Inactivo",
};

const ROLE_FIELD_LABEL: Record<PlayerRoleField, string> = {
  arquero: "Arquero",
  jugador_campo: "Campo",
  mixto: "Mixto",
};

const STATUS_BADGE: Record<PlayerStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  approved: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  inactive: "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200",
};

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function PlayersListFilterable({ players }: { players: Player[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return players;
    return players.filter((p) => {
      const nombreMatch = normalize(p.nombre).includes(q);
      const apodoMatch = p.apodo ? normalize(p.apodo).includes(q) : false;
      return nombreMatch || apodoMatch;
    });
  }, [players, query]);

  return (
    <div className="space-y-3">
      <input
        type="search"
        placeholder="Buscar por nombre o apodo…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
      />

      <p className="text-xs text-neutral-500">
        {filtered.length}
        {filtered.length === 1 ? " jugador" : " jugadores"}
        {query.trim() ? ` (filtrado de ${players.length})` : ""}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          Ningún jugador coincide con &ldquo;{query}&rdquo;.
        </div>
      ) : (
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 bg-white">
          {filtered.map((p) => (
            <li key={p.id}>
              <Link
                href={`/jugadores/${p.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-neutral-50"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <PlayerAvatar url={p.avatar_url} nombre={p.nombre} apodo={p.apodo} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-neutral-900">
                      <ClubCrest clubId={p.club_id} />
                      <span className="truncate">{playerLabel(p.nombre, p.apodo)}</span>
                    </p>
                    <p className="text-xs text-neutral-500">
                      {p.edad} años · {ROLE_FIELD_LABEL[p.role_field]}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {p.sinCalificar ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                      Sin calificar
                    </span>
                  ) : null}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[p.status]}`}
                  >
                    {STATUS_LABEL[p.status]}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
