"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export type CreateLugarState = null | { error: string } | { success: string };

const MAX_NOMBRE = 60;

export async function createLugar(
  _prev: CreateLugarState,
  formData: FormData,
): Promise<CreateLugarState> {
  await requireRole("admin");

  const raw = String(formData.get("nombre") ?? "").trim();
  if (!raw) return { error: "El nombre es obligatorio." };
  if (raw.length > MAX_NOMBRE) {
    return { error: `Demasiado largo (máximo ${MAX_NOMBRE} caracteres).` };
  }

  const supabase = await createClient();
  // created_by lo fuerza el trigger lugares_normalize_insert; pasamos
  // cualquier UUID para satisfacer el typing (sera reemplazado por auth.uid()).
  const { error } = await supabase.from("lugares").insert({
    nombre: raw,
    created_by: "00000000-0000-0000-0000-000000000000",
  });

  if (error) {
    // 23505 = unique violation (lugares_nombre_lower_unique).
    if (error.code === "23505") {
      return { error: "Ya existe un lugar con ese nombre." };
    }
    return { error: `No se pudo crear el lugar: ${error.message}` };
  }

  revalidatePath("/lugares");
  return { success: "Lugar creado." };
}
