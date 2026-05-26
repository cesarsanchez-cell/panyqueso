"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/require-role";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type ConvocatoriaInsert = Database["public"]["Tables"]["convocatorias"]["Insert"];

export type CreateConvocatoriaState =
  | null
  | { error: string }
  | { fieldErrors: Record<string, string> };

const MIN_CUPO = 10;
const MAX_CUPO = 24;
const MAX_NOTAS = 500;

function isYYYYMMDD(raw: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw);
}

function isHHMM(raw: string): boolean {
  // 00..23 : 00..59. Rechaza valores fuera de rango tipo "99:99" que el
  // regex previo \d{2}:\d{2} dejaba pasar.
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw);
}

export async function createConvocatoria(
  _prev: CreateConvocatoriaState,
  formData: FormData,
): Promise<CreateConvocatoriaState> {
  // Server-side guard: admin obligatorio (la UI ya lo respeta, pero esto es
  // la frontera real).
  const ctx = await requireRole("admin");

  const errors: Record<string, string> = {};

  const fecha = String(formData.get("fecha") ?? "").trim();
  if (!fecha) {
    errors.fecha = "La fecha es obligatoria.";
  } else if (!isYYYYMMDD(fecha)) {
    errors.fecha = "Formato inválido (AAAA-MM-DD).";
  }

  const hora = String(formData.get("hora") ?? "").trim();
  if (!hora) {
    errors.hora = "La hora es obligatoria.";
  } else if (!isHHMM(hora)) {
    errors.hora = "Formato inválido (HH:MM).";
  }

  const lugarRaw = String(formData.get("lugar_id") ?? "").trim();
  const lugar_id = lugarRaw.length > 0 ? lugarRaw : null;

  const cupoRaw = String(formData.get("cupo_maximo") ?? "").trim();
  const cupo_maximo = Number(cupoRaw);
  if (!Number.isInteger(cupo_maximo) || cupo_maximo < MIN_CUPO || cupo_maximo > MAX_CUPO) {
    errors.cupo_maximo = `Entre ${MIN_CUPO} y ${MAX_CUPO}.`;
  }

  const notasRaw = String(formData.get("notas") ?? "").trim();
  if (notasRaw.length > MAX_NOTAS) {
    errors.notas = `Máximo ${MAX_NOTAS} caracteres.`;
  }
  const notas = notasRaw.length > 0 ? notasRaw : null;

  if (Object.keys(errors).length > 0) {
    return { fieldErrors: errors };
  }

  const insertRow: ConvocatoriaInsert = {
    fecha,
    hora,
    lugar_id,
    cupo_maximo,
    notas,
    created_by: ctx.userId,
  };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("convocatorias")
    .insert(insertRow)
    .select("id")
    .single();

  if (error || !data) {
    return { error: `No se pudo crear la convocatoria: ${error?.message ?? "sin detalle"}` };
  }

  revalidatePath("/convocatorias");
  redirect(`/convocatorias/${data.id}`);
}

// ============================================================================
// createConvocatoriaFromGrupo: nuevo flujo. Admin elige grupo + fecha. Se
// llama al RPC que hereda lugar/hora/cupo del grupo y arma el roster.
// ============================================================================
export type CreateFromGrupoState = null | { error: string } | { success: string };

function mapRpcError(code: string | undefined, fallback: string): string {
  switch (code) {
    case "P0050":
      return "El grupo no existe.";
    case "P0051":
      return "El grupo está archivado.";
    case "P0052":
      return "Ya hay una convocatoria abierta o cerrada en esa fecha para este grupo.";
    case "P0058":
      return "La fecha es anterior al día de hoy.";
    default:
      return fallback;
  }
}

export async function createConvocatoriaFromGrupo(
  _prev: CreateFromGrupoState,
  formData: FormData,
): Promise<CreateFromGrupoState> {
  await requireRole("admin");

  const grupoId = String(formData.get("grupo_id") ?? "").trim();
  const fecha = String(formData.get("fecha") ?? "").trim();

  if (!grupoId) return { error: "Elegí un grupo." };
  if (!fecha || !isYYYYMMDD(fecha)) return { error: "Fecha inválida." };

  const supabase = await createClient();
  const { data: newConvId, error } = await supabase.rpc("create_convocatoria_from_grupo", {
    p_grupo_id: grupoId,
    p_fecha: fecha,
  });

  if (error || !newConvId) {
    return {
      error: mapRpcError(
        (error as { code?: string } | null)?.code,
        `No se pudo crear: ${error?.message ?? "sin detalle"}`,
      ),
    };
  }

  revalidatePath("/convocatorias");
  revalidatePath(`/grupos/${grupoId}`);
  redirect(`/convocatorias/${newConvId}`);
}
