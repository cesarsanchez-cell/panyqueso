"use server";

import { requireUser } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type FechaStatRow = {
  playerId: string;
  nombre: string;
  apodo: string | null;
  teamLabel: string | null;
  isGoalkeeper: boolean;
  goles: number;
  asistencias: number;
  golesEnContra: number;
};

// Detalle de una fecha del grupo (jugadores por equipo + goles/asistencias/
// autogoles). Se carga bajo demanda al expandir una fecha (FUT-116, fase 2). La
// RLS la garantiza el RPC (gate is_active_member_of_grupo / can_manage_match).
export async function loadFechaStats(matchId: string): Promise<FechaStatRow[]> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_grupo_fecha_stats", {
    p_match_id: matchId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    playerId: r.player_id,
    nombre: r.nombre,
    apodo: r.apodo,
    teamLabel: r.team_label,
    isGoalkeeper: r.is_goalkeeper,
    goles: r.goles,
    asistencias: r.asistencias,
    golesEnContra: r.goles_en_contra,
  }));
}
