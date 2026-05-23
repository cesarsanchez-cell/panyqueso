import Link from "next/link";

import { requireRole } from "@/lib/auth/require-role";

import { NewPlayerForm } from "./new-player-form";

export default async function NuevoJugadorPage() {
  await requireRole("admin");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/jugadores"
          className="text-sm text-neutral-500 transition hover:text-neutral-700"
        >
          ← Volver al listado
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Nuevo jugador</h1>
        <p className="mt-1 text-sm text-neutral-600">
          El alta queda como solicitud pendiente hasta que un veedor la apruebe.
        </p>
      </div>

      <NewPlayerForm />
    </div>
  );
}
