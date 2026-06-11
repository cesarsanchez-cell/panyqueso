"use client";

import { useActionState } from "react";

import { playerLabel } from "@/lib/players/label";

import { saveMatchAward, type SaveAwardState } from "./award-admin-actions";

export type AwardOption = {
  playerId: string;
  nombre: string;
  apodo: string | null;
};

export type AwardVote = {
  playerId: string;
  nombre: string;
  apodo: string | null;
  votos: number;
};

type Categoria = "carnicero" | "pinocho";

const TONES: Record<Categoria, { emoji: string; leader: string; btn: string }> = {
  carnicero: { emoji: "🔪", leader: "text-rose-800", btn: "bg-rose-600 hover:bg-rose-700" },
  pinocho: { emoji: "🪵", leader: "text-amber-800", btn: "bg-amber-700 hover:bg-amber-800" },
};

const selectClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

// Espejo de FiguraForm (FUT-99) para los premios votados (FUT-102): conteo de
// votos + override/desempate del admin. Genérico por categoría.
export function AwardAdminForm({
  convocatoriaId,
  categoria,
  nombrePremio,
  players,
  initialPlayerId,
  votes,
}: {
  convocatoriaId: string;
  categoria: Categoria;
  nombrePremio: string;
  players: AwardOption[];
  initialPlayerId: string | null;
  votes: AwardVote[];
}) {
  const [state, formAction, pending] = useActionState<SaveAwardState, FormData>(
    saveMatchAward,
    null,
  );
  const tone = TONES[categoria];

  // votes viene ordenado por votos desc (RPC get_award_votes). El líder es único
  // si el primero supera al segundo; si empatan, no hay líder y el admin desempata.
  const totalVotos = votes.reduce((acc, v) => acc + v.votos, 0);
  const [first, second] = votes;
  const leader = first && (!second || first.votos > second.votos) ? first : null;
  const hayEmpate = Boolean(first && second && first.votos === second.votos);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="convocatoria_id" value={convocatoriaId} />
      <input type="hidden" name="categoria" value={categoria} />

      {totalVotos > 0 ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-xs font-semibold text-neutral-700">
            Votos de los jugadores ({totalVotos})
          </p>
          <ul className="mt-1.5 space-y-1 text-sm">
            {votes.map((v) => {
              const isLeader = leader?.playerId === v.playerId;
              return (
                <li key={v.playerId} className="flex items-center justify-between gap-2">
                  <span className={isLeader ? `font-semibold ${tone.leader}` : "text-neutral-800"}>
                    {isLeader ? `${tone.emoji} ` : ""}
                    {playerLabel(v.nombre, v.apodo)}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {v.votos} {v.votos === 1 ? "voto" : "votos"}
                  </span>
                </li>
              );
            })}
          </ul>
          {hayEmpate ? (
            <p className="mt-2 text-xs text-amber-700">
              Hay empate en el primer puesto: elegí abajo para desempatar.
            </p>
          ) : leader && !initialPlayerId ? (
            <p className="mt-2 text-xs text-neutral-500">
              Sin override, gana el más votado ({playerLabel(leader.nombre, leader.apodo)}).
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-neutral-500">
          Todavía no hay votos. Gana el más votado cuando voten; si no, elegilo a mano acá.
        </p>
      )}

      <div>
        <label
          htmlFor={`award_${categoria}_player_id`}
          className="block text-xs font-medium text-neutral-700"
        >
          {totalVotos > 0
            ? "Override / desempate (dejá sin asignar para respetar el voto)."
            : `Elegí ${nombrePremio} a mano (o dejalo sin asignar).`}
        </label>
        <select
          // key atado al valor guardado: tras guardar (revalidate), el select se
          // re-monta mostrando al elegido, sin que el reset del form action de
          // React 19 lo vuelva al default de cuando montó.
          key={initialPlayerId ?? "empty"}
          id={`award_${categoria}_player_id`}
          name="award_player_id"
          defaultValue={initialPlayerId ?? ""}
          className={selectClass}
        >
          <option value="">— Sin asignar —</option>
          {players.map((p) => (
            <option key={p.playerId} value={p.playerId}>
              {playerLabel(p.nombre, p.apodo)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={`rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${tone.btn}`}
        >
          {pending ? "Guardando…" : `Guardar ${nombrePremio}`}
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
    </form>
  );
}
