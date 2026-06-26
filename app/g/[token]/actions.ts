"use server";

import { redirect } from "next/navigation";

import { createPhoneAccountHealingOrphan, syntheticEmailFromPhone } from "@/lib/auth/phone-account";
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
const PIERNA_VALUES: readonly PiernaHabil[] = ["derecha", "izquierda", "ambas", "ninguna"];
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    // El teléfono ya existe → no creamos cuenta: registramos un RECLAMO para que
    // el organizador confirme que es esta persona (FUT-120).
    const { data: estado } = await supabase.rpc("solicitar_reclamo_por_link", {
      p_token: token,
      p_phone: phone!,
    });
    redirect(`/g/${token}?reclamo=${estado ?? "creado"}`);
  }

  // 3. Crear auth user via admin API. Si choca con un huérfano (alta cortada a
  // la mitad: cuenta sin ficha que nunca logueó), lo barre y reintenta solo.
  const admin = createAdminClient();
  const email = syntheticEmailFromPhone(phone!);
  const acct = await createPhoneAccountHealingOrphan(admin, { phone: phone!, password, nombre });
  if (!acct.ok) {
    if (acct.alreadyActive) {
      return {
        error:
          "Ya existe una cuenta con este teléfono. Probá ingresar desde /login con tu celular y contraseña.",
      };
    }
    return { error: `No se pudo crear la cuenta: ${acct.message}` };
  }

  const authUserId = acct.userId;

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
      // El teléfono ya existía (jugador creado a mano o de otro grupo) → en vez
      // de cortar, registramos un RECLAMO para que el organizador lo confirme.
      const { data: estado } = await supabase.rpc("solicitar_reclamo_por_link", {
        p_token: token,
        p_phone: phone!,
      });
      redirect(`/g/${token}?reclamo=${estado ?? "creado"}`);
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

  // 5b. Si el grupo requiere aprobación, el alta queda PENDING: no auto-login.
  // La persona ingresa recién cuando el organizador la aprueba.
  if (grupo.grupo_requiere_aprobacion) {
    redirect(`/g/${token}?pendiente=1`);
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

// ============================================================================
// checkPhone: paso 1 del acceso unificado. Dado el celular, decide el camino:
//   'nuevo'   -> no está en la base       -> alta nueva (joinGroup).
//   'activar' -> existe pero nunca logueó -> setea su clave (activateExisting).
//   'login'   -> ya tiene cuenta activa   -> va a /login.
// No crea ni toca nada: solo consulta.
// ============================================================================
export type CheckPhoneState =
  | null
  | { error: string }
  | { ok: true; estado: "nuevo" | "activar" | "login"; nombre: string | null; phone: string };

export async function checkPhone(
  _prev: CheckPhoneState,
  formData: FormData,
): Promise<CheckPhoneState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { error: "Falta el token." };

  const phone = parseArPhone(String(formData.get("phone") ?? "").trim());
  if (!phone) return { error: "Celular inválido. Ingresá los 10 dígitos (ej: 1155551234)." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lookup_join_phone_state", {
    p_token: token,
    p_phone: phone,
  });
  if (error) return { error: "El link ya no es válido. Pedile uno nuevo al organizador." };

  const row = data && data.length > 0 ? data[0] : null;
  if (!row) return { error: "No se pudo verificar el celular. Probá de nuevo." };

  const estado = row.estado;
  if (estado !== "nuevo" && estado !== "activar" && estado !== "login") {
    return { error: "Respuesta inesperada del servidor." };
  }
  return { ok: true, estado, nombre: row.nombre, phone };
}

// ============================================================================
// activateExisting: camino 'activar'. El jugador ya existe en la base pero su
// cuenta nunca se activó. Setea la clave que eligió, vincula el login a su ficha
// y le asegura la membresía — conservando todo su historial. Auto-login.
// ============================================================================
export type ActivateState = null | { error: string } | { fieldErrors: Record<string, string> };

export async function activateExisting(
  _prev: ActivateState,
  formData: FormData,
): Promise<ActivateState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { error: "Falta el token." };

  const phone = parseArPhone(String(formData.get("phone") ?? "").trim());
  if (!phone) return { error: "Celular inválido." };

  const errors: Record<string, string> = {};
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("password_confirm") ?? "");
  if (password.length < 8) errors.password = "Mínimo 8 caracteres.";
  else if (password !== passwordConfirm) errors.password_confirm = "Las contraseñas no coinciden.";
  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  // Re-chequeo del estado (defensa ante carreras o un form manipulado): solo
  // 'activar' habilita este camino. A las cuentas activas no las pisa nadie.
  const supabase = await createClient();
  const { data: lk } = await supabase.rpc("lookup_join_phone_state", {
    p_token: token,
    p_phone: phone,
  });
  const estado = lk?.[0]?.estado ?? null;
  if (estado === "nuevo") {
    return { error: "No encontramos tu ficha. Volvé e ingresá tu celular de nuevo." };
  }
  if (estado === "login") {
    return { error: "Ya tenés una cuenta activa. Entrá desde panyqueso.ar/login con tu celular." };
  }
  if (estado !== "activar") {
    return { error: "El link ya no es válido. Pedile uno nuevo al organizador." };
  }

  // La ficha existe: resolvemos id + si ya tiene cuenta (service role).
  const admin = createAdminClient();
  const { data: player, error: playerErr } = await admin
    .from("players")
    .select("id, auth_user_id, nombre")
    .eq("phone", phone)
    .maybeSingle();
  if (playerErr || !player) {
    return { error: "No encontramos tu ficha. Hablá con el organizador." };
  }

  const email = syntheticEmailFromPhone(phone);
  let authUserId = player.auth_user_id;

  if (!authUserId) {
    // Cat. sin cuenta: la creamos con la clave que eligió.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { phone, nombre: player.nombre },
    });
    if (createErr || !created.user) {
      if (createErr?.message.toLowerCase().includes("already")) {
        return { error: "Ya existe una cuenta con ese celular. Entrá desde panyqueso.ar/login." };
      }
      return { error: `No se pudo crear tu cuenta: ${createErr?.message ?? "sin detalle"}` };
    }
    authUserId = created.user.id;
  } else {
    // Cat. con cuenta nunca usada: le seteamos la clave que eligió.
    const { error: updErr } = await admin.auth.admin.updateUserById(authUserId, {
      email,
      password,
    });
    if (updErr) return { error: `No se pudo guardar tu contraseña: ${updErr.message}` };
  }

  // Vincular ficha <-> cuenta + asegurar membresía (sin tocar datos/historial).
  const { error: actErr } = await admin.rpc("activar_jugador_existente", {
    p_token: token,
    p_player_id: player.id,
    p_auth_user_id: authUserId,
  });
  if (actErr) {
    return { error: `No se pudo activar tu cuenta: ${actErr.message}` };
  }

  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) {
    return {
      error:
        "Tu cuenta quedó lista, pero no pudimos iniciar sesión. Entrá desde panyqueso.ar/login con tu celular y tu clave.",
    };
  }

  redirect("/mi-perfil?welcome=1");
}
