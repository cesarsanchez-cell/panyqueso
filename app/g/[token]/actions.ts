"use server";

import { redirect } from "next/navigation";

import { isValidClubId } from "@/lib/clubs";
import { parseArPhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type PlayerRoleField = Database["public"]["Enums"]["player_role_field"];
type PositionPref = Database["public"]["Enums"]["position_pref"];
type PiernaHabil = Database["public"]["Enums"]["pierna_habil_enum"];

export type JoinGroupState = null | { error: string } | { fieldErrors: Record<string, string> };

const ROLES: readonly PlayerRoleField[] = ["arquero", "jugador_campo", "mixto"];
const POSITIONS: readonly PositionPref[] = ["arquero", "defensor", "mediocampista", "delantero"];
const PIERNA_VALUES: readonly PiernaHabil[] = ["derecha", "izquierda", "ambas"];
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function syntheticEmailFromPhone(phone: string): string {
  return `${phone.toLowerCase()}@phone.fdlm.local`;
}

function parseFechaNacimiento(raw: string): { fecha: string; edad: number } | null {
  if (!FECHA_REGEX.test(raw)) return null;
  const dob = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let edad = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) edad--;
  if (edad < 14 || edad > 99) return null;
  return { fecha: raw, edad };
}

export async function joinGroup(
  _prev: JoinGroupState,
  formData: FormData,
): Promise<JoinGroupState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { error: "Falta el token." };

  const errors: Record<string, string> = {};

  const phone = parseArPhone(String(formData.get("phone") ?? "").trim());
  if (!phone) errors.phone = "Celular inválido. Ingresá los 10 dígitos (ej: 1155551234).";

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) errors.nombre = "Ingresá tu nombre.";
  else if (nombre.length > 80) errors.nombre = "Demasiado largo (máx 80).";

  const dob = parseFechaNacimiento(String(formData.get("fecha_nacimiento") ?? "").trim());
  if (!dob) {
    errors.fecha_nacimiento = "Fecha inválida (edad debe estar entre 14 y 99).";
  }

  const role_field_raw = String(formData.get("role_field") ?? "").trim();
  const role_field = ROLES.includes(role_field_raw as PlayerRoleField)
    ? (role_field_raw as PlayerRoleField)
    : null;
  if (!role_field) errors.role_field = "Elegí un rol.";

  const position_pref_raw = String(formData.get("position_pref") ?? "").trim();
  const position_pref = POSITIONS.includes(position_pref_raw as PositionPref)
    ? (position_pref_raw as PositionPref)
    : null;
  if (!position_pref) errors.position_pref = "Elegí una posición.";

  const emailRaw = String(formData.get("email") ?? "").trim();
  let emailOptional: string | null = null;
  if (emailRaw) {
    if (!EMAIL_REGEX.test(emailRaw) || emailRaw.length > 254) errors.email = "Email inválido.";
    else emailOptional = emailRaw.toLowerCase();
  }

  const piernaRaw = String(formData.get("pierna_habil") ?? "").trim();
  let pierna_habil: PiernaHabil | null = null;
  if (piernaRaw) {
    if (!PIERNA_VALUES.includes(piernaRaw as PiernaHabil)) {
      errors.pierna_habil = "Valor inválido.";
    } else {
      pierna_habil = piernaRaw as PiernaHabil;
    }
  }

  // club_id opcional: slug del catálogo (lib/clubs.ts). Si no es válido se
  // ignora (dato neutro, no bloquea el alta).
  const clubRaw = String(formData.get("club_id") ?? "").trim();
  const club_id: string | null = isValidClubId(clubRaw) ? clubRaw : null;

  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("password_confirm") ?? "");
  if (password.length < 8) errors.password = "Mínimo 8 caracteres.";
  else if (password !== passwordConfirm) errors.password_confirm = "Las contraseñas no coinciden.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  // 1. Re-validar que el link siga activo (grupo activo) sin login.
  const supabase = await createClient();
  const { data: grupoRows, error: grupoErr } = await supabase.rpc("get_group_by_join_token", {
    p_token: token,
  });
  if (grupoErr) return { error: `No se pudo cargar el grupo: ${grupoErr.message}` };
  const grupo = grupoRows && grupoRows.length > 0 ? grupoRows[0] : null;
  if (!grupo) return { error: "El link ya no es válido. Pedile uno nuevo al organizador." };

  // 2. Pre-check de phone collision (mejor error antes de crear auth.user).
  const { data: existingPlayer } = await supabase
    .from("players")
    .select("id")
    .eq("phone", phone!)
    .maybeSingle();
  if (existingPlayer) {
    return {
      error:
        "Ya hay una cuenta con este teléfono. Ingresá desde /login con tu celular y contraseña.",
    };
  }

  // 3. Crear auth user via admin API.
  const admin = createAdminClient();
  const email = syntheticEmailFromPhone(phone!);
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { phone: phone!, nombre },
  });

  if (createErr || !created.user) {
    if (createErr?.message.toLowerCase().includes("already")) {
      return {
        error:
          "Ya existe una cuenta con este teléfono. Probá ingresar desde /login con tu celular y contraseña.",
      };
    }
    return { error: `No se pudo crear la cuenta: ${createErr?.message ?? "sin detalle"}` };
  }

  const authUserId = created.user.id;

  // 4. claim_group_join atomico. Si falla, borramos el auth.user para no dejar orfanos.
  const { data: newPlayerId, error: claimErr } = await admin.rpc("claim_group_join", {
    p_token: token,
    p_auth_user_id: authUserId,
    p_phone: phone!,
    p_nombre: nombre,
    p_fecha_nacimiento: dob!.fecha,
    p_edad: dob!.edad,
    p_role_field: role_field!,
    p_position_pref: position_pref!,
  });

  if (claimErr) {
    await admin.auth.admin.deleteUser(authUserId);
    const code = (claimErr as { code?: string }).code;
    if (code === "P0024") {
      return {
        error: "Ya hay una cuenta con este teléfono. Ingresá desde /login con tu celular.",
      };
    }
    if (code === "P0030") return { error: "El link ya no es válido." };
    if (code === "P0031")
      return { error: "El grupo fue archivado. Pedile un link nuevo al organizador." };
    return { error: `No se pudo completar el registro: ${claimErr.message}` };
  }

  // 5. Datos opcionales (email, pierna_habil, club_id). Best-effort.
  if (newPlayerId && (emailOptional || pierna_habil || club_id)) {
    await admin
      .from("players")
      .update({
        ...(emailOptional ? { email: emailOptional } : {}),
        ...(pierna_habil ? { pierna_habil } : {}),
        ...(club_id ? { club_id } : {}),
      })
      .eq("id", newPlayerId);
  }

  // 6. Auto-login con las credenciales recien creadas.
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) {
    return {
      error:
        "Tu cuenta se creó pero no pudimos iniciar sesión. Andá a /login con tu celular y contraseña.",
    };
  }

  redirect("/mi-perfil?welcome=1");
}
