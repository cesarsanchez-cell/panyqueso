"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { generateMultiTeams } from "@/lib/teams/generate-multi";
import { type GeneratorInput } from "@/lib/teams/generate";
import {
  addLateArrivalToBench,
  armadoPlayerIds,
  buildPresentismoArmado,
  type PresentismoArmado,
} from "@/lib/teams/presentismo";
import { loadGroupRatings } from "@/lib/teams/group-ratings";

export type CanchaResult = { ok: true } | { ok: false; error: string };
export type AbrirResult = { ok: true; convocatoriaId: string } | { ok: false; error: string };

function mapError(code: string | undefined, fallback: string): string {
  switch (code) {
    case "P0013":
      return "No gestionás este grupo.";
    case "P0050":
      return "El grupo no existe.";
    case "P0051":
      return "El grupo está archivado.";
    case "P0052":
      return "Ya hay una sesión/convocatoria para este grupo en esa fecha.";
    case "P0053":
      return "La sesión no existe.";
    case "P0057":
      return "La sesión ya no está abierta.";
    case "P0058":
      return "La fecha es anterior a hoy.";
    case "P0044":
      return "Ese jugador no es miembro activo del grupo.";
    case "P0059":
      return "Esa persona ya está en la cancha.";
    case "P0080":
      return "Esta operación es solo para el modo presentismo.";
    default:
      return fallback;
  }
}

// ---------------------------------------------------------------------------
// Abrir cancha (crea la sesión presentismo)
// ---------------------------------------------------------------------------
export async function abrirCancha(grupoId: string): Promise<AbrirResult> {
  await requireRole(["admin", "coordinador"]);
  if (!grupoId) return { ok: false, error: "Falta el grupo." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("abrir_cancha", { p_grupo_id: grupoId });
  if (error) {
    return {
      ok: false,
      error: mapError((error as { code?: string }).code, "No se pudo abrir la cancha."),
    };
  }

  revalidatePath(`/grupos/${grupoId}`);
  revalidatePath(`/grupos/${grupoId}/cancha`);
  return { ok: true, convocatoriaId: data as string };
}

// ---------------------------------------------------------------------------
// Check-in de un miembro
// ---------------------------------------------------------------------------
export async function checkinMiembro(
  grupoId: string,
  convocatoriaId: string,
  playerId: string,
): Promise<CanchaResult> {
  await requireRole(["admin", "coordinador"]);
  if (!convocatoriaId || !playerId) return { ok: false, error: "Faltan datos." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("checkin_miembro", {
    p_convocatoria_id: convocatoriaId,
    p_player_id: playerId,
  });
  if (error) {
    return {
      ok: false,
      error: mapError((error as { code?: string }).code, "No se pudo hacer el check-in."),
    };
  }

  revalidatePath(`/grupos/${grupoId}/cancha`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Check-in de un probador (NN, rating 6)
// ---------------------------------------------------------------------------
export async function checkinProbador(
  grupoId: string,
  convocatoriaId: string,
  nombre: string,
): Promise<CanchaResult> {
  await requireRole(["admin", "coordinador"]);
  const limpio = nombre.trim();
  if (!convocatoriaId) return { ok: false, error: "Falta la sesión." };
  if (!limpio) return { ok: false, error: "Poné un nombre para el probador." };
  if (limpio.length > 80) return { ok: false, error: "Nombre demasiado largo (máx 80)." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("checkin_probador", {
    p_convocatoria_id: convocatoriaId,
    p_nombre: limpio,
  });
  if (error) {
    return {
      ok: false,
      error: mapError((error as { code?: string }).code, "No se pudo sumar el probador."),
    };
  }

  revalidatePath(`/grupos/${grupoId}/cancha`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Quitar a alguien del check-in
// ---------------------------------------------------------------------------
export async function quitarCheckin(
  grupoId: string,
  convocatoriaId: string,
  playerId: string,
): Promise<CanchaResult> {
  await requireRole(["admin", "coordinador"]);
  if (!convocatoriaId || !playerId) return { ok: false, error: "Faltan datos." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("quitar_checkin", {
    p_convocatoria_id: convocatoriaId,
    p_player_id: playerId,
  });
  if (error) {
    return { ok: false, error: mapError((error as { code?: string }).code, "No se pudo quitar.") };
  }

  revalidatePath(`/grupos/${grupoId}/cancha`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Armar equipos (genera el plan inicial y lo persiste como snapshot)
// ---------------------------------------------------------------------------
type PresentRow = {
  player: {
    id: string;
    nombre: string;
    role_field: GeneratorInput["role_field"];
    position_pref: GeneratorInput["position_pref"];
    internal_score: number | null;
    physical: number | null;
    mental: number | null;
    technical: number | null;
    edad: number | null;
    positions_possible: GeneratorInput["position_pref"][] | null;
    is_guest: boolean | null;
  } | null;
};

async function loadPresentForGenerator(
  supabase: Awaited<ReturnType<typeof createClient>>,
  convocatoriaId: string,
): Promise<{ inputs: GeneratorInput[]; guestIds: Set<string> }> {
  const { data: conv } = await supabase
    .from("convocatorias")
    .select("grupo_id")
    .eq("id", convocatoriaId)
    .maybeSingle();
  const grupoId = conv?.grupo_id ?? null;

  const { data } = await supabase
    .from("convocatoria_players")
    .select(
      `player:players!player_id(id, nombre, role_field, position_pref, internal_score,
         physical, mental, technical, edad, positions_possible, is_guest)`,
    )
    .eq("convocatoria_id", convocatoriaId)
    .not("llegada_at", "is", null)
    .neq("attendance_status", "declinado");

  const rows = (data ?? []) as PresentRow[];
  const base = rows
    .map((r) => r.player)
    .filter(
      (p): p is NonNullable<PresentRow["player"]> & { internal_score: number } =>
        p !== null && p.internal_score !== null,
    );

  const overrides = await loadGroupRatings(
    supabase,
    grupoId,
    base.map((p) => p.id),
  );

  const guestIds = new Set(base.filter((p) => p.is_guest).map((p) => p.id));

  const inputs: GeneratorInput[] = base.map((p) => {
    const g = overrides.get(p.id);
    return {
      id: p.id,
      nombre: p.nombre,
      role_field: g?.role_field ?? p.role_field,
      position_pref: g?.position_pref ?? p.position_pref,
      internal_score: g ? g.internal_score : Number(p.internal_score),
      physical: g?.physical ?? p.physical ?? undefined,
      mental: g?.mental ?? p.mental ?? undefined,
      technical: g?.technical ?? p.technical ?? undefined,
      edad: p.edad ?? undefined,
      positions_possible: g?.positions_possible ?? p.positions_possible ?? undefined,
    };
  });

  return { inputs, guestIds };
}

export async function armarEquipos(
  grupoId: string,
  convocatoriaId: string,
  numTeams: number,
  teamSize: number,
): Promise<CanchaResult> {
  await requireRole(["admin", "coordinador"]);
  if (!convocatoriaId) return { ok: false, error: "Falta la sesión." };

  const nt = Math.max(2, Math.min(3, Math.trunc(numTeams)));
  const ts = Math.max(2, Math.min(12, Math.trunc(teamSize)));

  const supabase = await createClient();
  const { inputs, guestIds } = await loadPresentForGenerator(supabase, convocatoriaId);

  if (inputs.length < nt * 2) {
    return {
      ok: false,
      error: `Hay ${inputs.length} presentes; muy pocos para ${nt} equipos. Sumá gente o bajá la cantidad de equipos.`,
    };
  }

  const summary = generateMultiTeams(inputs, { numTeams: nt, teamSize: ts });
  const armado = buildPresentismoArmado(summary, { numTeams: nt, teamSize: ts, guestIds });

  const { error } = await supabase.rpc("guardar_armado_presentismo", {
    p_convocatoria_id: convocatoriaId,
    p_armado: armado as unknown as Json,
  });
  if (error) {
    return {
      ok: false,
      error: mapError((error as { code?: string }).code, "No se pudo guardar el armado."),
    };
  }

  revalidatePath(`/grupos/${grupoId}/cancha`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sumar una llegada tarde al armado ya hecho (va al banco con menos suplentes,
// sin re-balancear). El jugador ya tiene que estar en el present-list.
// ---------------------------------------------------------------------------
export async function agregarAlArmado(
  grupoId: string,
  convocatoriaId: string,
  playerId: string,
): Promise<CanchaResult> {
  await requireRole(["admin", "coordinador"]);
  if (!convocatoriaId || !playerId) return { ok: false, error: "Faltan datos." };

  const supabase = await createClient();

  const { data: conv } = await supabase
    .from("convocatorias")
    .select("presentismo_armado")
    .eq("id", convocatoriaId)
    .maybeSingle();

  const armado = (conv?.presentismo_armado ?? null) as unknown as PresentismoArmado | null;
  if (!armado) return { ok: false, error: "Todavía no armaste los equipos." };

  if (armadoPlayerIds(armado).includes(playerId)) {
    return { ok: false, error: "Esa persona ya está en el armado." };
  }

  const { data: player } = await supabase
    .from("players")
    .select("id, nombre, is_guest")
    .eq("id", playerId)
    .maybeSingle();
  if (!player) return { ok: false, error: "Jugador no encontrado." };

  const next = addLateArrivalToBench(armado, {
    id: player.id,
    nombre: player.nombre,
    esProbador: player.is_guest ? true : undefined,
  });

  const { error } = await supabase.rpc("guardar_armado_presentismo", {
    p_convocatoria_id: convocatoriaId,
    p_armado: next as unknown as Json,
  });
  if (error) {
    return {
      ok: false,
      error: mapError((error as { code?: string }).code, "No se pudo sumar al armado."),
    };
  }

  revalidatePath(`/grupos/${grupoId}/cancha`);
  return { ok: true };
}
