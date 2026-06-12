"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { parseArPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

export type AltaCoordinadorState = null | { error: string } | { success: string };

/**
 * Alta group-first del coordinador (FUT-108, 2c-3): nombre + celular + edad. El
 * RPC coordinador_alta_jugador deduplica por celular (vincula si existe, crea
 * approved si no) y vincula al grupo. El celular se normaliza a E164 acá para
 * que el dedup matchee con players.phone.
 */
export async function coordinadorAltaJugador(
  _prev: AltaCoordinadorState,
  formData: FormData,
): Promise<AltaCoordinadorState> {
  await requireRole(["admin", "coordinador"]);

  const grupoId = String(formData.get("grupo_id") ?? "").trim();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const celularRaw = String(formData.get("celular") ?? "").trim();
  const edadRaw = String(formData.get("edad") ?? "").trim();

  if (!grupoId) return { error: "Elegí un grupo." };
  if (!nombre) return { error: "Falta el nombre." };

  const celular = parseArPhone(celularRaw);
  if (!celular) return { error: "Celular inválido. Usá un número argentino (ej. 11 2345 6789)." };

  const edad = Number(edadRaw);
  if (!Number.isInteger(edad) || edad < 14 || edad > 99) {
    return { error: "Edad inválida (14 a 99)." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("coordinador_alta_jugador", {
    p_grupo_id: grupoId,
    p_nombre: nombre,
    p_celular: celular,
    p_edad: edad,
  });

  if (error) {
    switch (error.code) {
      case "P0032":
        return { error: "Ese jugador ya está en el grupo." };
      case "P0013":
        return { error: "No gestionás ese grupo." };
      case "P0031":
        return { error: "El grupo está archivado." };
      default:
        return { error: "No se pudo dar de alta. Probá de nuevo." };
    }
  }

  const linked = (data as { linked?: boolean } | null)?.linked === true;
  revalidatePath("/jugadores");
  return {
    success: linked
      ? "Jugador vinculado a tu grupo (ya existía). Ajustá su rating si hace falta."
      : "Jugador creado y agregado a tu grupo. Ajustá su rating cuando quieras.",
  };
}
