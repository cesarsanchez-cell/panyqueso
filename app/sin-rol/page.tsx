import { requireUser } from "@/lib/auth/require-role";

import { logout } from "../(app)/actions";

export default async function SinRolPage() {
  // Exige sesion pero NO rol (justamente, esta pagina es para usuarios sin rol).
  const { email } = await requireUser();

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-12">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold text-neutral-900">Cuenta sin rol asignado</h1>
          <p className="text-sm text-neutral-600">
            Tu cuenta <span className="font-medium">{email}</span> está creada pero todavía no tiene
            un rol. Pedile al admin que te asigne <code>admin</code> o <code>veedor</code>
            para empezar a usar la app.
          </p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="w-full rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
