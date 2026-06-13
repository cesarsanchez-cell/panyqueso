import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

import { type FechaPersonal } from "./fecha-card";
import { GrupoHistorialCard, type FechaEntry } from "./grupo-historial-card";
import { type VoteCandidate } from "./figura-vote-form";
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
  // abierta — solo míos, normalmente 1.
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

  // Premios votados (carnicero / pinocho) de MIS partidos, para el overlay.
  const { data: awardsData } = await supabase.rpc("get_my_match_awards");
  const awardsByMatch = new Map((awardsData ?? []).map((a) => [a.match_id, a]));

  const { data: myPid } = await supabase.rpc("current_player_id");
  const year = new Date().getFullYear();

  // Datos PERSONALES por partido jugado (overlay sobre las fechas del grupo) +
  // el resumen (V/E/D + goles) por grupo, todo de MIS partidos.
  type GrupoAcc = {
    grupoId: string;
    grupoNombre: string;
    resumen: HistorialResumenData;
  };
  const grupos = new Map<string, GrupoAcc>();
  const personalByMatch = new Map<string, FechaPersonal>();

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

    const candidates = candidatesByMatch[r.match_id] ?? [];
    const award = awardsByMatch.get(r.match_id);
    personalByMatch.set(r.match_id, {
      resultado: r.resultado,
      miGoles: r.goles ?? 0,
      miAsist: r.asistencias ?? 0,
      miEnContra: r.goles_en_contra ?? 0,
      figuraEsMia: r.figura_es_mia,
      votingOpen: r.figura_votacion_abierta && candidates.length > 0,
      candidates,
      figuraCierra: r.figura_votacion_cierra,
      miVotoFigura: r.mi_voto_player_id,
      miVotoCarnicero: award?.mi_voto_carnicero ?? null,
      miVotoPinocho: award?.mi_voto_pinocho ?? null,
    });
  }

  // Además de los grupos donde jugué, incluir aquellos donde soy miembro ACTIVO
  // aunque todavía no haya jugado: igual quiero ver sus fechas (FUT-116). El
  // resumen V/E/D queda en cero hasta que juegue.
  if (myPid) {
    const { data: mems } = await supabase
      .from("grupo_membresias")
      .select("grupo_id")
      .eq("player_id", myPid)
      .eq("status", "activo");
    const faltantes = (mems ?? []).map((m) => m.grupo_id).filter((id) => !grupos.has(id));
    if (faltantes.length > 0) {
      const { data: gs } = await supabase.from("grupos").select("id, nombre").in("id", faltantes);
      for (const g of gs ?? []) {
        grupos.set(g.id, {
          grupoId: g.id,
          grupoNombre: g.nombre,
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
        });
      }
    }
  }

  // Por cada grupo (donde juego o soy miembro): TODAS sus fechas jugadas
  // (FUT-116, group-wide) + la tabla anual del Prode.
  const grupoData = await Promise.all(
    Array.from(grupos.values()).map(async (g) => {
      const [{ data: fechasData }, { data: tabla }] = await Promise.all([
        supabase.rpc("get_grupo_fechas", { p_grupo_id: g.grupoId }),
        supabase.rpc("get_prode_tabla", { p_grupo_id: g.grupoId, p_year: year }),
      ]);

      const fechas: FechaEntry[] = (fechasData ?? []).map((f) => ({
        resumen: {
          matchId: f.match_id,
          fecha: f.fecha,
          scoreA: f.score_a,
          scoreB: f.score_b,
          winner: f.winner,
          figuraNombre: f.figura_nombre,
          carniceroNombre: f.carnicero_nombre,
          pinochoHabilitado: f.pinocho_habilitado,
          pinochoNombre: f.pinocho_nombre,
          videoUrl: f.video_resumen_url,
        },
        personal: personalByMatch.get(f.match_id),
      }));

      const prodeRows: ProdeTablaRow[] = (tabla ?? []).map((t) => ({
        playerId: t.player_id,
        nombre: t.nombre ?? "—",
        apodo: t.apodo,
        puntos: t.puntos,
        aciertosExactos: t.aciertos_exactos,
        pronosticos: t.pronosticos,
      }));

      // Ordenar grupos por su fecha más reciente (fechasData ya viene desc).
      const ultimaFecha = fechas[0]?.resumen.fecha ?? "";
      return { ...g, fechas, prodeRows, ultimaFecha };
    }),
  );

  grupoData.sort((a, b) => b.ultimaFecha.localeCompare(a.ultimaFecha));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Mi Actividad</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Tu resumen, tu Prode y las fechas de cada grupo. Cada grupo es su mundo.
        </p>
      </div>

      {grupoData.length === 0 ? (
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
        grupoData.map((g) => (
          <GrupoHistorialCard
            key={g.grupoId}
            grupoNombre={g.grupoNombre}
            resumen={g.resumen}
            prodeRows={g.prodeRows}
            myPlayerId={myPid ?? null}
            year={year}
            fechas={g.fechas}
          />
        ))
      )}
    </div>
  );
}
