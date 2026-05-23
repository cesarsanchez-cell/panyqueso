"use client";

import { useActionState } from "react";

import {
  clearDraft,
  generateDraft,
  promotePlayerToGoalkeeper,
  swapPlayer,
  type DraftMutationState,
} from "./draft-actions";

export function GenerateDraftForm({
  convocatoriaId,
  hasDraft,
}: {
  convocatoriaId: string;
  hasDraft: boolean;
}) {
  const [state, formAction, pending] = useActionState<DraftMutationState, FormData>(
    generateDraft,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input type="hidden" name="convocatoria_id" value={convocatoriaId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Generando…" : hasDraft ? "Regenerar teams" : "Generar teams"}
      </button>
      {state && "error" in state ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function ClearDraftForm({ convocatoriaId }: { convocatoriaId: string }) {
  const [state, formAction, pending] = useActionState<DraftMutationState, FormData>(
    clearDraft,
    null,
  );

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="convocatoria_id" value={convocatoriaId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Borrando…" : "Borrar draft"}
      </button>
      {state && "error" in state ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function SwapPlayerForm({
  convocatoriaId,
  playerId,
  targetLabel,
}: {
  convocatoriaId: string;
  playerId: string;
  targetLabel: string;
}) {
  const [state, formAction, pending] = useActionState<DraftMutationState, FormData>(
    swapPlayer,
    null,
  );

  return (
    <form action={formAction} className="inline-flex items-center">
      <input type="hidden" name="convocatoria_id" value={convocatoriaId} />
      <input type="hidden" name="player_id" value={playerId} />
      <button
        type="submit"
        disabled={pending}
        title={`Mover a ${targetLabel}`}
        className="rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "…" : `→ ${targetLabel}`}
      </button>
      {state && "error" in state ? (
        <p role="alert" className="ml-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function PromoteToGKForm({
  convocatoriaId,
  playerId,
}: {
  convocatoriaId: string;
  playerId: string;
}) {
  const [state, formAction, pending] = useActionState<DraftMutationState, FormData>(
    promotePlayerToGoalkeeper,
    null,
  );

  return (
    <form action={formAction} className="inline-flex items-center">
      <input type="hidden" name="convocatoria_id" value={convocatoriaId} />
      <input type="hidden" name="player_id" value={playerId} />
      <button
        type="submit"
        disabled={pending}
        title="Hacer arquero"
        className="rounded-md border border-emerald-300 bg-white px-2 py-0.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "…" : "GK"}
      </button>
      {state && "error" in state ? (
        <p role="alert" className="ml-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
