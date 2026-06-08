import Link from "next/link";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

import { NewConvocatoriaForm } from "./new-convocatoria-form";

type SearchParams = { grupo?: string };

function proximaOcurrencia(diaSemana: number): string {
  // Devuelve YYYY-MM-DD de la proxima fecha (inclusive hoy si coincide).
  const d = new Date();
  const today = d.getDay();
  const offset = today <= diaSemana ? diaSemana - today : 7 - today + diaSemana;
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export default async function NuevaConvocatoriaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole("admin");
  const sp = await searchParams;

  const supabase = await createClient();
  const { data: grupos, error } = await supabase
    .from("grupos")
    .select(
      "id, nombre, dia_semana, hora, cupo_titulares, lugar:lugares!lugar_id(id, nombre, ubicacion_maps_url)",
    )
    .eq("status", "activo")
    .order("nombre", { ascending: true });

  if (error) {
    throw new Error(`No se pudieron cargar los grupos: ${error.message}`);
  }

  const gruposList = (grupos ?? []).map((g) => ({
    id: g.id,
    nombre: g.nombre,
    dia_semana: g.dia_semana,
    hora: g.hora,
    cupo_titulares: g.cupo_titulares,
    fecha_sugerida: proximaOcurrencia(g.dia_semana),
    lugar: g.lugar
      ? { id: g.lugar.id, nombre: g.lugar.nombre, maps: g.lugar.ubicacion_maps_url }
      : null,
  }));

  const grupoPreseleccionado =
    sp.grupo && gruposList.some((g) => g.id === sp.grupo) ? sp.grupo : (gruposList[0]?.id ?? "");

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
          Elegí un grupo y la fecha. Se hereda el roster del grupo en orden de alta: los primeros
          según el cupo van como titulares, el resto a la lista de espera.
        </p>
      </div>

      {gruposList.length === 0 ? (
        <section className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-5 text-sm text-neutral-600">
          No hay grupos activos. Creá uno desde{" "}
          <Link href="/grupos" className="underline">
            /grupos
          </Link>
          .
        </section>
      ) : (
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <NewConvocatoriaForm grupos={gruposList} grupoPreseleccionado={grupoPreseleccionado} />
        </section>
      )}
    </div>
  );
}
