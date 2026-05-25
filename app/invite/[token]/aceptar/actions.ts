"use server";

import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type PlayerRoleField = Database["public"]["Enums"]["player_role_field"];
type PositionPref = Database["public"]["Enums"]["position_pref"];

export type AcceptInviteState = null | { error: string } | { fieldErrors: Record<string, string> };

const ROLES: readonly PlayerRoleField[] = ["arquero", "jugador_campo", "mixto"];
const POSITIONS: readonly PositionPref[] = ["arquero", "defensor", "mediocampista", "delantero"];
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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

export async function acceptInvite(
  _prev: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { error: "Falta el token." };

  const errors: Record<string, string> = {};

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

  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("password_confirm") ?? "");
  if (password.length < 8) errors.password = "Mínimo 8 caracteres.";
  else if (password !== passwordConfirm) errors.password_confirm = "Las contraseñas no coinciden.";

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  // 1. Re-validar invite vigente via funcion publica (sin login).
  const supabase = await createClient();
  const { data: inviteRows, error: inviteErr } = await supabase.rpc("get_invite_by_token", {
    p_token: token,
  });
  if (inviteErr) return { error: `No se pudo cargar la invitación: ${inviteErr.message}` };
  const invite = inviteRows && inviteRows.length > 0 ? inviteRows[0] : null;
  if (!invite) return { error: "El link ya no es válido." };
  if (invite.invite_used_at) return { error: "Esta invitación ya fue usada." };
  if (invite.invite_declined_at) return { error: "Ya marcaste 'No voy' en esta invitación." };
  if (new Date(invite.invite_expires_at).getTime() <= Date.now()) {
    return { error: "El link expiró. Pedile uno nuevo al organizador." };
  }

  // 2. Pre-check de phone collision (mejor error antes de crear auth.user).
  const { data: existingPlayer } = await supabase
    .from("players")
    .select("id")
    .eq("phone", invite.invite_phone)
    .maybeSingle();
  if (existingPlayer) {
    return {
      error: "Ya hay un jugador registrado con este teléfono. Contactá al organizador del grupo.",
    };
  }

  // 3. Crear auth user via admin API.
  const admin = createAdminClient();
  const email = syntheticEmailFromPhone(invite.invite_phone);
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { phone: invite.invite_phone, nombre },
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

  // 4. claim_invite atomico. Si falla, borramos el auth.user para no dejar orfanos.
  const { error: claimErr } = await admin.rpc("claim_invite", {
    p_token: token,
    p_auth_user_id: authUserId,
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
        error: "Ya hay un jugador registrado con este teléfono. Contactá al organizador del grupo.",
      };
    }
    if (code === "P0021") return { error: "Esta invitación ya fue usada." };
    if (code === "P0022") return { error: "Ya marcaste 'No voy' en esta invitación." };
    if (code === "P0023") return { error: "El link expiró." };
    return { error: `No se pudo completar el registro: ${claimErr.message}` };
  }

  // 5. Auto-login con las credenciales recien creadas.
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) {
    return {
      error:
        "Tu cuenta se creó pero no pudimos iniciar sesión. Andá a /login con tu celular y contraseña.",
    };
  }

  redirect("/mi-perfil?welcome=1");
}
