import type { Database, Json } from "@/lib/supabase/database.types";

type PlayerRoleField = Database["public"]["Enums"]["player_role_field"];
type PositionPref = Database["public"]["Enums"]["position_pref"];
type RatingConfidence = Database["public"]["Enums"]["rating_confidence"];
type PlayerStatus = Database["public"]["Enums"]["player_status"];

/**
 * Labels humanos compartidos para campos del jugador. Usar siempre que se
 * muestre una key tecnica de la tabla players al usuario (diffs, banners,
 * notices). Mantener sincronizado con la definicion del schema.
 */
export const PLAYER_FIELD_LABEL: Record<string, string> = {
  nombre: "Nombre",
  edad: "Edad",
  role_field: "Rol",
  position_pref: "Posición preferida",
  positions_possible: "Posiciones posibles",
  technical: "Técnica",
  physical: "Físico",
  mental: "Mental",
  rating_confidence: "Confianza",
  status: "Estado",
  private_notes: "Notas privadas",
};

const ROLE_FIELD_LABEL: Record<PlayerRoleField, string> = {
  arquero: "Arquero",
  jugador_campo: "Jugador de campo",
  mixto: "Mixto",
};

const POSITION_PREF_LABEL: Record<PositionPref, string> = {
  arquero: "Arquero",
  defensor: "Defensor",
  mediocampista: "Mediocampista",
  delantero: "Delantero",
};

const RATING_CONFIDENCE_LABEL: Record<RatingConfidence, string> = {
  inicial: "Inicial (sin evaluar)",
  baja: "Baja",
  media: "Media",
  alta: "Alta",
};

const PLAYER_STATUS_LABEL: Record<PlayerStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  inactive: "Inactivo",
};

const ENUM_LABEL_BY_FIELD: Record<string, Record<string, string>> = {
  role_field: ROLE_FIELD_LABEL,
  position_pref: POSITION_PREF_LABEL,
  rating_confidence: RATING_CONFIDENCE_LABEL,
  status: PLAYER_STATUS_LABEL,
};

/**
 * Formatea el valor de un campo del jugador para mostrar. Si el campo
 * tiene un enum conocido, mapea al label humano. Caso contrario stringifica.
 */
export function formatPlayerValue(field: string, value: Json | undefined): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) {
    return value.map((v) => formatPlayerValue(field, v)).join(" · ");
  }
  if (typeof value === "object") return JSON.stringify(value);

  const enumMap = ENUM_LABEL_BY_FIELD[field];
  if (enumMap && typeof value === "string") {
    const label = enumMap[value];
    if (label) return label;
  }
  return String(value);
}
