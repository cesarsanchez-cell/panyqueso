"use client";

import { useState, useTransition } from "react";

import { formatArLocal, waNumberFromE164 } from "@/lib/phone";

import {
  invitarJugadorNuevo,
  lookupJugador,
  vincularJugador,
  type LookupResult,
} from "./agregar-jugador-actions";

export type AgregarJugadorGrupo = { id: string; nombre: string };

type View =
  | { kind: "search" }
  | {
      kind: "found";
      celular: string;
      playerId: string;
      nombre: string;
      apodo: string | null;
      avatarUrl: string | null;
      alreadyMember: boolean;
    }
  | { kind: "notFound"; celular: string }
  | { kind: "linked"; nombre: string; pushed: boolean }
  | { kind: "invited"; nombre: string; celular: string; url: string };

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";
const labelClass = "block text-xs font-medium text-neutral-700";
const primaryBtn =
  "rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryBtn =
  "rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50";

/**
 * Card "Agregar jugador" en dos pasos (admin + coordinador):
 *   1. Buscar por celular.
 *   2a. Si existe -> vincular al grupo (+ push de bienvenida best-effort).
 *   2b. Si no existe -> invitar a completar su ficha (link para WhatsApp).
 */
export function AgregarJugadorCard({ grupos }: { grupos: AgregarJugadorGrupo[] }) {
  const single = grupos.length === 1;
  const [grupoId, setGrupoId] = useState(single ? (grupos[0]?.id ?? "") : "");
  const [celularInput, setCelularInput] = useState("");
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [view, setView] = useState<View>({ kind: "search" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (grupos.length === 0) return null;

  const grupoNombre = grupos.find((g) => g.id === grupoId)?.nombre ?? "";

  function reset() {
    setCelularInput("");
    setNombreNuevo("");
    setError(null);
    setView({ kind: "search" });
  }

  function onBuscar() {
    setError(null);
    startTransition(async () => {
      const res: LookupResult = await lookupJugador(grupoId, celularInput);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.exists) {
        setView({
          kind: "found",
          celular: res.celular,
          playerId: res.playerId,
          nombre: res.nombre,
          apodo: res.apodo,
          avatarUrl: res.avatarUrl,
          alreadyMember: res.alreadyMember,
        });
      } else {
        setView({ kind: "notFound", celular: res.celular });
      }
    });
  }

  function onVincular(celular: string) {
    setError(null);
    startTransition(async () => {
      const res = await vincularJugador(grupoId, celular);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setView({ kind: "linked", nombre: res.nombre, pushed: res.pushed });
    });
  }

  function onInvitar(celular: string) {
    setError(null);
    startTransition(async () => {
      const res = await invitarJugadorNuevo(grupoId, celular, nombreNuevo);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const url = `${window.location.origin}${res.link}`;
      setView({ kind: "invited", nombre: res.nombre, celular, url });
    });
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Agregar jugador
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        Buscá por celular. Si ya juega, lo sumás al grupo (hereda su rating). Si es nuevo, lo
        invitás a completar sus datos y entra solo.
      </p>

      {/* Selector de grupo (si gestiona más de uno) */}
      {!single ? (
        <div className="mt-4">
          <label htmlFor="grupo_id" className={labelClass}>
            Grupo
          </label>
          <select
            id="grupo_id"
            value={grupoId}
            onChange={(e) => {
              setGrupoId(e.target.value);
              reset();
            }}
            className={inputClass}
          >
            <option value="" disabled>
              Elegí un grupo…
            </option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Paso 1: buscar por celular */}
      {view.kind === "search" ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="grow">
            <label htmlFor="celular" className={labelClass}>
              Celular
            </label>
            <input
              id="celular"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="11 2345 6789"
              value={celularInput}
              onChange={(e) => setCelularInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && grupoId && celularInput) {
                  e.preventDefault();
                  onBuscar();
                }
              }}
              className={inputClass}
            />
          </div>
          <button
            type="button"
            disabled={pending || !grupoId || !celularInput}
            onClick={onBuscar}
            className={primaryBtn}
          >
            {pending ? "Buscando…" : "Buscar"}
          </button>
        </div>
      ) : null}

      {/* Paso 2a: encontrado */}
      {view.kind === "found" ? (
        <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-4">
          <div className="flex items-center gap-3">
            {view.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={view.avatarUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-sm font-semibold text-neutral-600">
                {view.nombre.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-neutral-900">
                {view.nombre}
                {view.apodo ? (
                  <span className="ml-1 font-normal text-neutral-500">({view.apodo})</span>
                ) : null}
              </p>
              <p className="text-xs text-neutral-500">{formatArLocal(view.celular)}</p>
            </div>
          </div>

          {view.alreadyMember ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
              Ya es parte de <span className="font-medium">{grupoNombre}</span>.
            </p>
          ) : (
            <p className="mt-3 text-xs text-neutral-600">
              Se va a sumar a <span className="font-medium">{grupoNombre}</span> heredando su
              rating.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {!view.alreadyMember ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => onVincular(view.celular)}
                className={primaryBtn}
              >
                {pending ? "Vinculando…" : `Vincular a ${grupoNombre}`}
              </button>
            ) : null}
            <button type="button" onClick={reset} className={secondaryBtn}>
              Buscar otro
            </button>
          </div>
        </div>
      ) : null}

      {/* Paso 2b: no encontrado -> invitar */}
      {view.kind === "notFound" ? (
        <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-xs text-neutral-600">
            No hay ningún jugador con el celular{" "}
            <span className="font-mono">{formatArLocal(view.celular)}</span>. Invitalo a completar
            sus datos; entra solo en cuanto cargue su ficha.
          </p>
          <div className="mt-3">
            <label htmlFor="nombre_nuevo" className={labelClass}>
              Nombre
            </label>
            <input
              id="nombre_nuevo"
              type="text"
              autoComplete="off"
              placeholder="Nombre y apellido"
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !nombreNuevo.trim()}
              onClick={() => onInvitar(view.celular)}
              className={primaryBtn}
            >
              {pending ? "Generando…" : "Invitar a completar sus datos"}
            </button>
            <button type="button" onClick={reset} className={secondaryBtn}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {/* Resultado: vinculado */}
      {view.kind === "linked" ? (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-900">
            <span className="font-semibold">{view.nombre}</span> ya es parte de{" "}
            <span className="font-medium">{grupoNombre}</span>.
            {view.pushed ? " Le avisamos por la app." : ""}
          </p>
          <button type="button" onClick={reset} className={`${secondaryBtn} mt-3`}>
            Agregar otro
          </button>
        </div>
      ) : null}

      {/* Resultado: invitado -> link para compartir */}
      {view.kind === "invited" ? (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-900">
            Invitación lista para <span className="font-semibold">{view.nombre}</span>. Mandale el
            link para que complete sus datos:
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input readOnly value={view.url} className={`${inputClass} font-mono`} />
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(view.url)}
              className={secondaryBtn}
            >
              Copiar
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`https://wa.me/${waNumberFromE164(view.celular)}?text=${encodeURIComponent(
                `Hola ${view.nombre}! Te sumo al grupo ${grupoNombre}. Entrá acá para completar tus datos: ${view.url}`,
              )}`}
              target="_blank"
              rel="noreferrer"
              className={primaryBtn}
            >
              Enviar por WhatsApp
            </a>
            <button type="button" onClick={reset} className={secondaryBtn}>
              Agregar otro
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
