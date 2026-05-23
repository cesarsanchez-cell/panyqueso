import Link from "next/link";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

import { NewConvocatoriaForm } from "./new-convocatoria-form";

function defaultFecha(): string {
  // Sugerimos el próximo martes (día 2). El admin lo puede pisar.
  const d = new Date();
  const day = d.getDay();
  const offset = day <= 2 ? 2 - day : 7 - day + 2;
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export default async function NuevaConvocatoriaPage() {
  await requireRole("admin");

  const supabase = await createClient();
  const { data: lugares, error } = await supabase
    .from("lugares")
    .select("id, nombre")
    .order("nombre", { ascending: true });

  if (error) {
    throw new Error(`No se pudieron cargar los lugares: ${error.message}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/convocatorias"
          className="text-sm text-neutral-500 transition hover:text-neutral-700"
        >
          ← Volver al listado
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Nueva convocatoria</h1>
        <p className="mt-1 text-sm text-neutral-600">
          La convocatoria nace abierta. Después agregás los jugadores convocados.
        </p>
      </div>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <NewConvocatoriaForm
          lugares={lugares ?? []}
          defaults={{
            fecha: defaultFecha(),
            hora: "20:00",
            cupo_maximo: 12,
          }}
        />
      </section>
    </div>
  );
}
