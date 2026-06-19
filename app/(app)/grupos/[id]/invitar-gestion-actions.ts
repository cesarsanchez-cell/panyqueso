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
// No necesita migración: todo es sobre tablas existentes con service-role.
// La autoridad se chequea acá (service-role saltea RLS): coordinador solo lo
// otorga el admin; veedor lo otorga el admin o el coordinador del grupo.

export type InvitarGestionState =
  | null
  | { error: string }
  | { tempPassword: string; phone: string; nombre: string };

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

  if (rol === "veedor" && ctx.profile.role === "coordinador") {
    const supa = await createClient();
    const { data: manages } = await supa
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
  const supabase = await createClient();
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

  // 4. Crear la cuenta por celular (sintético) con clave temporal.
  const email = syntheticEmailFromPhone(phone);
  const tempPassword = generateTempPassword();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { phone, nombre },
  });

  if (createErr || !created.user) {
    if (createErr?.message.toLowerCase().includes("already")) {
      return {
        error:
          "Ya existe una cuenta con ese celular. Si la persona ya tiene acceso, asignale el rango desde la app o avisá al admin.",
      };
    }
    return { error: `No se pudo crear la cuenta: ${createErr?.message ?? "sin detalle"}` };
  }

  const authUserId = created.user.id;

  // 5. Otorgar el rango en el profile (el trigger ya creó el profile sin rol).
  // Si algo falla a partir de acá, borramos el auth.user para no dejar huérfanos.
  const { error: profErr } = await admin
    .from("profiles")
    .update({ role: rol, nombre })
    .eq("id", authUserId);
  if (profErr) {
    await admin.auth.admin.deleteUser(authUserId);
    return { error: `No se pudo configurar el perfil: ${profErr.message}` };
  }

  // 6. Ligar al grupo (coordinador_grupos / veedor_grupos).
  const tabla = rol === "coordinador" ? "coordinador_grupos" : "veedor_grupos";
  const { error: linkErr } = await admin
    .from(tabla)
    .insert({ profile_id: authUserId, grupo_id: grupoId, created_by: ctx.userId });
  if (linkErr) {
    await admin.auth.admin.deleteUser(authUserId);
    return { error: `No se pudo vincular al grupo: ${linkErr.message}` };
  }

  revalidatePath(`/grupos/${grupoId}`);
  return { tempPassword, phone, nombre };
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
