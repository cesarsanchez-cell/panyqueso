"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { armadoPlayerIds, type PresentismoArmado } from "@/lib/teams/presentismo";

import {
  abrirCancha,
  agregarAlArmado,
  armarEquipos,
  checkinMiembro,
  checkinProbador,
  confirmarSesion,
  quitarCheckin,
  type CanchaResult,
} from "./actions";

export type PresentRow = {
  playerId: string;
  nombre: string;
  apodo: string | null;
  esProbador: boolean;
  llegadaAt: string | null;
};

export type MemberRow = {
  playerId: string;
  nombre: string;
  apodo: string | null;
};

type Props = {
  grupoId: string;
  convocatoriaId: string | null;
  present: PresentRow[];
  membersAvailable: MemberRow[];
  armado: PresentismoArmado | null;
};

const card = "rounded-lg border border-neutral-200 bg-white p-5 shadow-sm";
const h2 = "text-sm font-semibold uppercase tracking-wide text-neutral-500";
const primaryBtn =
  "rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60";
const chipBtn =
  "rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60";
const inputClass =
  "block w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

function nombreCompleto(nombre: string, apodo: string | null): string {
  return apodo ? `${nombre} (${apodo})` : nombre;
}

export function CanchaLive({ grupoId, convocatoriaId, present, membersAvailable, armado }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [probador, setProbador] = useState("");
  const [numTeams, setNumTeams] = useState(2);
  const [teamSize, setTeamSize] = useState(7);

  function run(fn: () => Promise<CanchaResult | { ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r && !r.ok) setError(("error" in r && r.error) || "Algo salió mal.");
      else router.refresh();
    });
  }

  // ---- Sin sesión abierta: abrir cancha --------------------------------------
  if (!convocatoriaId) {
    return (
      <section className={card}>
        <h2 className={h2}>Abrir la cancha</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Todavía no hay una sesión abierta. Abrila y empezá a registrar a los que llegan.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const r = await abrirCancha(grupoId);
              return r.ok ? { ok: true } : { ok: false, error: r.error };
            })
          }
          className={`${primaryBtn} mt-4`}
        >
          {pending ? "Abriendo…" : "Abrir cancha"}
        </button>
        {error ? <ErrorMsg msg={error} /> : null}
      </section>
    );
  }

  const convId = convocatoriaId;
  const enArmado = armado ? new Set(armadoPlayerIds(armado)) : null;
  const llegadasTarde = enArmado ? present.filter((p) => !enArmado.has(p.playerId)) : [];

  return (
    <div className="space-y-6">
      {/* Presentes */}
      <section className={card}>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className={h2}>En la cancha</h2>
          <span className="text-sm font-semibold text-neutral-700">{present.length}</span>
        </div>
        {present.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Nadie registrado todavía.</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100">
            {present.map((p, i) => (
              <li key={p.playerId} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate text-sm text-neutral-900">
                  <span className="mr-2 text-xs text-neutral-400">{i + 1}.</span>
                  {nombreCompleto(p.nombre, p.apodo)}
                  {p.esProbador ? (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                      probador
                    </span>
                  ) : null}
                  {enArmado && !enArmado.has(p.playerId) ? (
                    <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-800">
                      llegó tarde
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => quitarCheckin(grupoId, convId, p.playerId))}
                  className="shrink-0 text-xs text-neutral-400 transition hover:text-red-600"
                >
                  quitar
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Probador */}
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="grow">
            <label htmlFor="probador" className="block text-xs font-medium text-neutral-700">
              Sumar probador
            </label>
            <input
              id="probador"
              type="text"
              placeholder="Nombre (o dejalo vacío → NN)"
              value={probador}
              onChange={(e) => setProbador(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const r = await checkinProbador(grupoId, convId, probador.trim() || "NN");
                if (r.ok) setProbador("");
                return r;
              })
            }
            className={primaryBtn}
          >
            + Probador
          </button>
        </div>
      </section>

      {/* Miembros para registrar */}
      <section className={card}>
        <h2 className={h2}>Miembros del grupo</h2>
        {membersAvailable.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            Todos los miembros ya están en la cancha (o no hay miembros).
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {membersAvailable.map((m) => (
              <button
                key={m.playerId}
                type="button"
                disabled={pending}
                onClick={() => run(() => checkinMiembro(grupoId, convId, m.playerId))}
                className={chipBtn}
              >
                + {nombreCompleto(m.nombre, m.apodo)}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Armar */}
      <section className={card}>
        <h2 className={h2}>Armar equipos</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="numTeams" className="block text-xs font-medium text-neutral-700">
              Equipos
            </label>
            <select
              id="numTeams"
              value={numTeams}
              onChange={(e) => setNumTeams(Number(e.target.value))}
              className={`mt-1 ${inputClass}`}
            >
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </div>
          <div>
            <label htmlFor="teamSize" className="block text-xs font-medium text-neutral-700">
              Jugadores por equipo
            </label>
            <input
              id="teamSize"
              type="number"
              min={2}
              max={12}
              value={teamSize}
              onChange={(e) => setTeamSize(Number(e.target.value))}
              className={`mt-1 w-24 ${inputClass}`}
            />
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => armarEquipos(grupoId, convId, numTeams, teamSize))}
            className={primaryBtn}
          >
            {armado ? "Re-armar" : "Armar"}
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Re-armar reparte de cero a todos los presentes (equipos parejos + suplentes). Las llegadas
          tarde podés sumarlas al banco sin re-armar.
        </p>

        {/* Llegadas tarde pendientes de sumar */}
        {llegadasTarde.length > 0 ? (
          <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-3">
            <p className="text-xs font-medium text-sky-900">
              Llegaron después del armado — sumalos al banco más corto:
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {llegadasTarde.map((p) => (
                <button
                  key={p.playerId}
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => agregarAlArmado(grupoId, convId, p.playerId))}
                  className={chipBtn}
                >
                  + {nombreCompleto(p.nombre, p.apodo)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* Armado */}
      {armado ? (
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={h2}>Equipos armados</h2>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`/grupos/${grupoId}/cancha/equipos`}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50"
              >
                📷 Imagen para WhatsApp
              </a>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (
                    window.confirm(
                      "Confirmar registra el partido (cuenta para historial y premios votados) y cierra la cancha. ¿Confirmás?",
                    )
                  ) {
                    run(() => confirmarSesion(grupoId, convId));
                  }
                }}
                className={primaryBtn}
              >
                ✓ Confirmar sesión
              </button>
            </div>
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {armado.teams.map((t) => (
              <div key={t.label} className="rounded-md border border-neutral-200 p-3">
                <h3 className="text-sm font-bold text-neutral-900">Equipo {t.label}</h3>
                <ul className="mt-2 space-y-1 text-sm text-neutral-800">
                  {t.goalkeeper ? (
                    <li>
                      🧤 {t.goalkeeper.nombre}
                      {t.goalkeeper.esProbador ? " ·prob" : ""}
                    </li>
                  ) : null}
                  {t.players.map((p) => (
                    <li key={p.id}>
                      {p.nombre}
                      {p.esProbador ? " ·prob" : ""}
                    </li>
                  ))}
                </ul>
                {t.bench.length > 0 ? (
                  <div className="mt-2 border-t border-neutral-100 pt-2">
                    <p className="text-xs font-medium text-neutral-500">Suplentes</p>
                    <ul className="mt-1 space-y-1 text-sm text-neutral-600">
                      {t.bench.map((p) => (
                        <li key={p.id}>
                          {p.nombre}
                          {p.esProbador ? " ·prob" : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {error ? <ErrorMsg msg={error} /> : null}
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      {msg}
    </p>
  );
}
