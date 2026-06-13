import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

import { type VoteCandidate } from "./figura-vote-form";
import {
  GrupoHistorialCard,
  type AwardEntry,
  type HistMatchRow,
  type MatchEntry,
} from "./grupo-historial-card";
import { type HistorialResumenData } from "./historial-resumen";
import { type ProdeTablaRow } from "./prode-tabla";

export default async function HistorialPage() {
  const ctx = await requireUser();

  if (ctx.profile.role !== "player") {
    redirect("/");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_match_history");

  if (error) {
    throw new Error(`No se pudo cargar tu historial: ${error.message}`);
  }

  const rows = data ?? [];

  // Candidatos a figura (los que jugaron) para los partidos con la votación
  // abierta. Solo esos matches necesitan el selector; normalmente es 1.
  const candidatesByMatch: Record<string, VoteCandidate[]> = {};
  await Promise.all(
    rows
      .filter((r) => r.figura_votacion_abierta)
      .map(async (r) => {
        const { data: cands } = await supabase.rpc("get_figura_candidates", {
          p_match_id: r.match_id,
        });
        candidatesByMatch[r.match_id] = (cands ?? []).map((c) => ({
          playerId: c.player_id,
          nombre: c.nombre,
          apodo: c.apodo,
        }));
      }),
  );

  // Estado de los premios votados (carnicero / pinocho) por partido (FUT-102).
  const { data: awardsData } = await supabase.rpc("get_my_match_awards");
  const awardsByMatch = new Map<string, AwardEntry>(
    (awardsData ?? []).map((a) => [a.match_id, a as AwardEntry]),
  );

  const { data: myPid } = await supabase.rpc("current_player_id");
  const year = new Date().getFullYear();

  // Agrupar TODO por grupo: cada grupo es su mundo (FUT-115). Mezclar goles /
  // triunfos / prode de grupos distintos no significa nada. El orden de los
  // grupos es por su partido más reciente (rows ya viene fecha desc).
  type GrupoAcc = {
    grupoId: string;
    grupoNombre: string;
    resumen: HistorialResumenData;
    matches: MatchEntry[];
    ultimaFecha: string;
  };
  const grupos = new Map<string, GrupoAcc>();

  for (const r of rows) {
    if (!r.grupo_id) continue;
    let g = grupos.get(r.grupo_id);
    if (!g) {
      g = {
        grupoId: r.grupo_id,
        grupoNombre: r.grupo_nombre ?? "Grupo",
        resumen: {
          jugados: 0,
          ganados: 0,
          empates: 0,
          perdidos: 0,
          goles: 0,
          asistencias: 0,
          golesEnContra: 0,
          figuras: 0,
        },
        matches: [],
        ultimaFecha: r.fecha,
      };
      grupos.set(r.grupo_id, g);
    }

    g.resumen.jugados += 1;
    if (r.resultado === "ganado") g.resumen.ganados += 1;
    else if (r.resultado === "empate") g.resumen.empates += 1;
    else if (r.resultado === "perdido") g.resumen.perdidos += 1;
    g.resumen.goles += r.goles ?? 0;
    g.resumen.asistencias += r.asistencias ?? 0;
    g.resumen.golesEnContra += r.goles_en_contra ?? 0;
    if (r.figura_es_mia) g.resumen.figuras += 1;
    if (r.fecha > g.ultimaFecha) g.ultimaFecha = r.fecha;

    const candidates = candidatesByMatch[r.match_id] ?? [];
    g.matches.push({
      row: r as HistMatchRow,
      candidates,
      award: awardsByMatch.get(r.match_id),
      votingOpen: r.figura_votacion_abierta && candidates.length > 0,
    });
  }

  // Tabla anual del Prode 🔮 por grupo (cuenta solo partidos con resultado).
  const prodeByGrupo = new Map<string, ProdeTablaRow[]>();
  await Promise.all(
    Array.from(grupos.keys()).map(async (grupoId) => {
      const { data: tabla } = await supabase.rpc("get_prode_tabla", {
        p_grupo_id: grupoId,
        p_year: year,
      });
      prodeByGrupo.set(
        grupoId,
        (tabla ?? []).map((t) => ({
          playerId: t.player_id,
          nombre: t.nombre ?? "—",
          apodo: t.apodo,
          puntos: t.puntos,
          aciertosExactos: t.aciertos_exactos,
          pronosticos: t.pronosticos,
        })),
      );
    }),
  );

  const gruposOrdenados = Array.from(grupos.values()).sort((a, b) =>
    b.ultimaFecha.localeCompare(a.ultimaFecha),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Mi Actividad</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Tu resumen, tu Prode y tus partidos, separados por grupo. Cada grupo es su mundo.
        </p>
      </div>

      {gruposOrdenados.length === 0 ? (
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Todavía no jugaste partidos
          </h2>
          <p className="mt-3 text-sm text-neutral-500">
            Cuando juegues tu primer partido confirmado, va a aparecer acá con la fecha, el grupo y
            el resultado.
          </p>
        </section>
      ) : (
        gruposOrdenados.map((g) => (
          <GrupoHistorialCard
            key={g.grupoId}
            grupoNombre={g.grupoNombre}
            resumen={g.resumen}
            prodeRows={prodeByGrupo.get(g.grupoId) ?? []}
            myPlayerId={myPid ?? null}
            year={year}
            matches={g.matches}
          />
        ))
      )}
    </div>
  );
}
