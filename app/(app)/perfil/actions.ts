"use server";

import { revalidatePath } from "next/cache";

import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export type PerfilState = { ok: true } | { error: string } | null;

type PlayerRoleField = Database["public"]["Enums"]["player_role_field"];
type PositionPref = Database["public"]["Enums"]["position_pref"];
type PiernaHabil = Database["public"]["Enums"]["pierna_habil_enum"];

export type MisDatosState =
  | null
  | { error: string }
  | { fieldErrors: Record<string, string> }
  | { success: string };

const ROLES: readonly PlayerRoleField[] = ["arquero", "jugador_campo", "mixto"];
const POSITIONS: readonly PositionPref[] = ["arquero", "defensor", "mediocampista", "delantero"];
const PIERNA_VALUES: readonly PiernaHabil[] = ["derecha", "izquierda", "ambas"];
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NOMBRE = 80;
const MAX_APODO = 40;
const MAX_MAPS_URL = 500;

// Mapeo de los errcode del RPC update_my_player_data a mensajes UI.
const PG_ERROR_MAP: Record<string, string> = {
  P0040: "Tu usuario no está vinculado a un jugador.",
  P0060: "El nombre es obligatorio.",
  P0061: `Nombre demasiado largo (máximo ${MAX_NOMBRE} caracteres).`,
  P0062: "La fecha de nacimiento es obligatoria.",
  P0063: "La fecha de nacimiento debe dar una edad entre 14 y 99.",
  P0064: `Apodo demasiado largo (máximo ${MAX_APODO} caracteres).`,
  P0065: "Email inválido.",
  P0066: "El link de Google Maps debe empezar con http(s)://.",
  P0067: "Elegí un rol en cancha.",
  P0068: "Elegí una posición preferida.",
  P0069: "Ese email ya está asignado a otro jugador.",
};

export async function updatePassword(_prev: PerfilState, formData: FormData): Promise<PerfilState> {
  const password = formData.get("password");
  const confirm = formData.get("confirm");

  if (typeof password !== "string" || typeof confirm !== "string") {
    return { error: "Datos inválidos" };
  }

  if (password.length < 8) {
    return { error: "La nueva contraseña debe tener al menos 8 caracteres" };
  }

  if (password !== confirm) {
    return { error: "Las contraseñas no coinciden" };
  }

  const supabase = await createClient();

  // La sesion existente (validada por middleware) habilita updateUser.
  // No exigimos password actual: si alguien tiene la sesion fisica, ya esta dentro.
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: "No se pudo actualizar la contraseña. Intentá de nuevo." };
  }

  return { ok: true };
}

// ============================================================================
// updateMyPlayerData: el jugador edita sus propios datos (no rating, no cel).
// Llama al RPC update_my_player_data que validacion + UPDATE corren con
// SECURITY DEFINER porque el rol player no tiene UPDATE directo en players.
// ============================================================================
export async function updateMyPlayerData(
  _prev: MisDatosState,
  formData: FormData,
): Promise<MisDatosState> {
  const errors: Record<string, string> = {};

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) errors.nombre = "Obligatorio.";
  else if (nombre.length > MAX_NOMBRE) errors.nombre = `Máximo ${MAX_NOMBRE} caracteres.`;

  const fechaRaw = String(formData.get("fecha_nacimiento") ?? "").trim();
  if (!fechaRaw) errors.fecha_nacimiento = "Obligatoria.";
  else if (!FECHA_REGEX.test(fechaRaw))
    errors.fecha_nacimiento = "Formato AAAA-MM-DD.";

  const apodoRaw = String(formData.get("apodo") ?? "").trim();
  if (apodoRaw.length > MAX_APODO) errors.apodo = `Máximo ${MAX_APODO} caracteres.`;

  const emailRaw = String(formData.get("email") ?? "").trim();
  if (emailRaw && (!EMAIL_REGEX.test(emailRaw) || emailRaw.length > 254)) {
    errors.email = "Email inválido.";
  }

  const piernaRaw = String(formData.get("pierna_habil") ?? "").trim();
  if (piernaRaw && !PIERNA_VALUES.includes(piernaRaw as PiernaHabil)) {
    errors.pierna_habil = "Valor inválido.";
  }

  const roleRaw = String(formData.get("role_field") ?? "").trim();
  if (!ROLES.includes(roleRaw as PlayerRoleField)) errors.role_field = "Elegí un rol.";

  const positionRaw = String(formData.get("position_pref") ?? "").trim();
  if (!POSITIONS.includes(positionRaw as PositionPref))
    errors.position_pref = "Elegí una posición.";

  const positions_possible = formData
    .getAll("positions_possible")
    .filter((v): v is string => typeof v === "string")
    .filter((v): v is PositionPref => POSITIONS.includes(v as PositionPref));

  const mapsRaw = String(formData.get("ubicacion_maps_url") ?? "").trim();
  if (mapsRaw) {
    if (mapsRaw.length > MAX_MAPS_URL) errors.ubicacion_maps_url = "URL demasiado larga.";
    else if (!/^https?:\/\//i.test(mapsRaw))
      errors.ubicacion_maps_url = "Debe empezar con http(s)://.";
  }

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  const supabase = await createClient();
  // Los text fields opcionales (apodo/email/maps) se pasan como string
  // vacio; la SQL los normaliza a null via nullif(btrim(...), ''). pierna
  // queda como null cuando el usuario elige el blank ("—"), porque es enum.
  const { error } = await supabase.rpc("update_my_player_data", {
    p_nombre: nombre,
    p_apodo: apodoRaw,
    p_fecha_nacimiento: fechaRaw,
    p_email: emailRaw,
    p_pierna_habil: piernaRaw ? (piernaRaw as PiernaHabil) : (null as unknown as PiernaHabil),
    p_role_field: roleRaw as PlayerRoleField,
    p_position_pref: positionRaw as PositionPref,
    p_positions_possible: positions_possible,
    p_ubicacion_maps_url: mapsRaw,
  });

  if (error) {
    const mapped = error.code ? PG_ERROR_MAP[error.code] : null;
    return { error: mapped ?? `No se pudo guardar: ${error.message}` };
  }

  revalidatePath("/perfil");
  revalidatePath("/mi-perfil");
  return { success: "Datos guardados." };
}
