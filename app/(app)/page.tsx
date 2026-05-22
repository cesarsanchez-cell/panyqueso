import { requireUser } from "@/lib/auth/require-role";

export default async function HomePage() {
  // El layout ya garantiza sesion + rol. Llamamos de nuevo solo para leer el
  // contexto (cacheado: no es una segunda query).
  const { profile } = await requireUser();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Hola, bienvenido.</h1>
        <p className="text-base text-neutral-600">
          Estás dentro del MVP de <span className="font-medium">Futbol de los martes</span>.
        </p>
      </div>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Tu sesión
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-500">Nombre</dt>
            <dd className="text-neutral-900">{profile.nombre ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-500">Rol</dt>
            <dd className="text-neutral-900">{profile.role ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <p className="text-sm text-neutral-500">
        Las pantallas de jugadores, convocatorias, partidos y auditoría se construyen en las
        próximas fases.
      </p>
    </div>
  );
}
