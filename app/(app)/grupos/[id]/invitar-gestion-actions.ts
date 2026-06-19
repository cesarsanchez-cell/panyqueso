"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { parseArPhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Alta de un coordinador/veedor PURO (sin ficha de jugador), por WhatsApp/celular
// — igual que se invita a un jugador a completar (cuenta por celular + clave
// temporal para compartir), pero acá la cuenta NO tiene ficha en players: la
// autoridad vive en profiles.role + coordinador_grupos/veedor_grupos.
//
// Si el celular YA tiene una cuenta de gestión (sin ficha), la sumamos al nuevo
// grupo (multi-grupo) en vez de fallar — sin clave temporal (ya tiene acceso).
//
// La autoridad se chequea acá (service-role saltea RLS): coordinador solo lo
// otorga el admin; veedor lo otorga el admin o el coordinador del grupo.

export type InvitarGestionState =
  | null
  | { error: string }
  | { ok: true; nombre: string; phone: string; tempPassword: string | null };

type Rol = "coordinador" | "veedor";

function generateTempPassword(): string {
  return randomBytes(9).toString("base64").replace(/\+/g, "A").replace(/\//g, "Z");
}

function syntheticEmailFromPhone(phone: string): string {
  return `${phone.toLowerCase()}@phone.fdlm.local`;
}

async function invitarGestion(
  rol: Rol,
  grupoId: string,
  celularRaw: string,
  nombreRaw: string,
): Promise<InvitarGestionState> {
  // 1. Autoridad. Coordinador: solo el admin. Veedor: admin o coordinador del grupo.
  const ctx = await requireRole(rol === "coordinador" ? "admin" : ["admin", "coordinador"]);

  if (!grupoId) return { error: "Falta el grupo." };

  const supabase = await createClient();

  if (rol === "veedor" && ctx.profile.role === "coordinador") {
    const { data: manages } = await supabase
      .from("coordinador_grupos")
      .select("id")
      .eq("grupo_id", grupoId)
      .eq("profile_id", ctx.userId)
      .maybeSingle();
    if (!manages) return { error: "No gestionás ese grupo." };
  }

  const nombre = nombreRaw.trim();
  if (!nombre) return { error: "Falta el nombre." };
  if (nombre.length > 80) return { error: "Nombre demasiado largo (máx 80)." };

  const phone = parseArPhone(celularRaw);
  if (!phone) {
    return { error: "Celular inválido. Usá un número argentino (ej. 11 2345 6789)." };
  }

  // 2. El grupo tiene que existir y estar activo.
  const { data: grupo, error: gErr } = await supabase
    .from("grupos")
    .select("id, status")
    .eq("id", grupoId)
    .maybeSingle();
  if (gErr) return { error: "No se pudo cargar el grupo." };
  if (!grupo) return { error: "El grupo no existe." };
  if (grupo.status !== "activo") return { error: "El grupo está archivado." };

  const admin = createAdminClient();

  // 3. Dedup: si el celular ya es de un jugador, no es un "coordinador/veedor
  // puro" — se le da el rango desde la lista de miembros (flujo existente).
  const { data: existingPlayer } = await admin
    .from("players")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (existingPlayer) {
    return {
      error:
        "Ese celular ya es de un jugador. Sumalo al grupo y asignale el rango desde la lista de miembros.",
    };
  }

  // 4. ¿Ya hay una cuenta de gestión con ese celular? (multi-grupo). Si la
  // migración no está aplicada, el lookup falla → seguimos como si no existiera.
  const { data: lookupRows } = await supabase.rpc("buscar_cuenta_gestion_por_celular", {
    p_celular: phone,
  });
  const existing = lookupRows && lookupRows.length > 0 ? lookupRows[0] : null;

  let authUserId: string;
  let tempPassword: string | null = null;

  if (existing) {
    if (existing.tiene_ficha) {
      return {
        error:
          "Ese celular ya es de un jugador. Sumalo al grupo y asignale el rango desde la lista de miembros.",
      };
    }
    if (existing.rol === "admin") {
      return { error: "Esa cuenta es admin; no se gestiona desde acá." };
    }
    const otro: Rol = rol === "coordinador" ? "veedor" : "coordinador";
    if (existing.rol === otro) {
      return { error: `Esa persona ya es ${otro}. Quitale ese rango primero.` };
    }

    authUserId = existing.auth_user_id;
    if (existing.rol !== rol) {
      const { error: profErr } = await admin
        .from("profiles")
        .update({ role: rol })
        .eq("id", authUserId);
      if (profErr) return { error: `No se pudo configurar el perfil: ${profErr.message}` };
    }
  } else {
    // Crear la cuenta por celular (sintético) con clave temporal.
    const email = syntheticEmailFromPhone(phone);
    tempPassword = generateTempPassword();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { phone, nombre },
    });

    if (createErr || !created.user) {
      if (createErr?.message.toLowerCase().includes("already")) {
        return {
          error: "Ya existe una cuenta con ese celular pero no se pudo vincular. Avisá al admin.",
        };
      }
      return { error: `No se pudo crear la cuenta: ${createErr?.message ?? "sin detalle"}` };
    }

    authUserId = created.user.id;

    // El trigger ya creó el profile (sin rol). Le ponemos rol + nombre. Si algo
    // falla a partir de acá, borramos el auth.user para no dejar huérfanos.
    const { error: profErr } = await admin
      .from("profiles")
      .update({ role: rol, nombre })
      .eq("id", authUserId);
    if (profErr) {
      await admin.auth.admin.deleteUser(authUserId);
      return { error: `No se pudo configurar el perfil: ${profErr.message}` };
    }
  }

  // 5. Ligar al grupo (idempotente: si ya estaba, no duplica).
  const tabla = rol === "coordinador" ? "coordinador_grupos" : "veedor_grupos";
  const { error: linkErr } = await admin
    .from(tabla)
    .upsert(
      { profile_id: authUserId, grupo_id: grupoId, created_by: ctx.userId },
      { onConflict: "profile_id,grupo_id", ignoreDuplicates: true },
    );
  if (linkErr) {
    // Rollback del auth.user solo si lo creamos en esta llamada.
    if (!existing) await admin.auth.admin.deleteUser(authUserId);
    return { error: `No se pudo vincular al grupo: ${linkErr.message}` };
  }

  revalidatePath(`/grupos/${grupoId}`);
  return { ok: true, nombre, phone, tempPassword };
}

export async function invitarCoordinadorNuevo(
  _prev: InvitarGestionState,
  formData: FormData,
): Promise<InvitarGestionState> {
  return invitarGestion(
    "coordinador",
    String(formData.get("grupo_id") ?? "").trim(),
    String(formData.get("celular") ?? "").trim(),
    String(formData.get("nombre") ?? "").trim(),
  );
}

export async function invitarVeedorNuevo(
  _prev: InvitarGestionState,
  formData: FormData,
): Promise<InvitarGestionState> {
  return invitarGestion(
    "veedor",
    String(formData.get("grupo_id") ?? "").trim(),
    String(formData.get("celular") ?? "").trim(),
    String(formData.get("nombre") ?? "").trim(),
  );
}
