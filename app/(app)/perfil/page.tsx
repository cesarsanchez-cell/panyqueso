import { requireUser } from "@/lib/auth/require-role";

import { PerfilForm } from "./perfil-form";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  veedor: "Veedor",
};

export default async function PerfilPage() {
  const { email, profile } = await requireUser();
  const roleLabel = profile.role ? ROLE_LABEL[profile.role] : "—";

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Tu perfil</h1>
        <p className="text-sm text-neutral-600">Información de tu cuenta y cambio de contraseña.</p>
      </header>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Datos</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-500">Email</dt>
            <dd className="truncate text-neutral-900">{email}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-500">Nombre</dt>
            <dd className="text-neutral-900">{profile.nombre ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-500">Rol</dt>
            <dd className="text-neutral-900">{roleLabel}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-neutral-500">
          El nombre y rol los gestiona el admin. Si necesitás cambios, pedíselos.
        </p>
      </section>

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
