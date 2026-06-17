import { requireUser } from "@/lib/auth/require-role";
import { formatArLocal } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

import { MisDatosForm, type MisDatosInitial } from "./mis-datos-form";
import { PerfilForm } from "./perfil-form";
import { PhotoForm } from "./photo-form";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  veedor: "Veedor",
  player: "Jugador",
  coordinador: "Coordinador",
};

export default async function PerfilPage() {
  const { email, profile } = await requireUser();
  const roleLabel = profile.role ? ROLE_LABEL[profile.role] : "—";

  // Cargamos la ficha para CUALQUIER cuenta que juegue (player o admin/
  // coordinador/veedor con ficha): los RPC se autodescubren por auth.uid(),
  // no por rol. Sin ficha no hay datos de jugador que mostrar.
  let playerData: MisDatosInitial | null = null;
  let playerAvatar: string | null = null;
  let playerNombre = "";
  const supabase = await createClient();
  const { data: rows, error } = await supabase.rpc("get_my_player_full");
  if (error) {
    throw new Error(`No se pudieron cargar tus datos: ${error.message}`);
  }
  const row = Array.isArray(rows) ? rows[0] : null;
  const hasFicha = !!row;
  if (row) {
    playerData = {
      nombre: row.nombre,
      apodo: row.apodo,
      fecha_nacimiento: row.fecha_nacimiento,
      email: row.email,
      phone: row.phone,
      pierna_habil: row.pierna_habil,
      role_field: row.role_field,
      position_pref: row.position_pref,
      positions_possible: row.positions_possible ?? [],
      ubicacion_maps_url: row.ubicacion_maps_url,
      club_id: row.club_id,
    };
    playerNombre = row.nombre;

    // avatar_url no viene en get_my_player_full; lo trae el summary.
    const { data: sumRows } = await supabase.rpc("get_my_player_summary");
    const sum = sumRows && sumRows.length > 0 ? sumRows[0] : null;
    playerAvatar = sum?.avatar_url ?? null;
    if (sum?.nombre) playerNombre = sum.nombre;
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Mi cuenta</h1>
        <p className="text-sm text-neutral-600">
          {hasFicha
            ? "Tus datos personales y cambio de contraseña."
            : "Información de tu cuenta y cambio de contraseña."}
        </p>
      </header>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Cuenta</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            {/* El jugador ingresa con su celular; su email interno es sintético
                (...@phone.fdlm.local) y no tiene sentido mostrárselo. */}
            <dt className="text-neutral-500">
              {playerData?.phone ? "Celular de ingreso" : "Email de ingreso"}
            </dt>
            <dd className="truncate text-neutral-900">
              {playerData?.phone ? formatArLocal(playerData.phone) : email}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-500">Rol</dt>
            <dd className="text-neutral-900">{roleLabel}</dd>
          </div>
        </dl>
        {!hasFicha ? (
          <p className="mt-4 text-xs text-neutral-500">
            El nombre y rol los gestiona el admin. Si necesitás cambios, pedíselos.
          </p>
        ) : null}
      </section>

      {playerData ? (
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Foto de perfil
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Sumá tu foto. Es opcional y se muestra en tu perfil.
          </p>
          <div className="mt-4">
            <PhotoForm currentUrl={playerAvatar} nombre={playerNombre} />
          </div>
        </section>
      ) : null}

      {playerData ? (
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Mis datos
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Podés actualizar todo menos tu celular (clave de ingreso) y tus calificaciones (las
            gestiona el admin junto al veedor).
          </p>
          <div className="mt-4">
            <MisDatosForm initial={playerData} />
          </div>
        </section>
      ) : null}

      {profile.role === "player" && !playerData ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Todavía no tenemos tus datos de jugador vinculados. Hablá con el admin.
        </section>
      ) : null}

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Cambiar contraseña
        </h2>
        <div className="mt-4">
          <PerfilForm />
        </div>
      </section>
    </div>
  );
}
