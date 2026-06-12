import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

import { BulkImportForm } from "./bulk-import-form";

const DIA_LABEL = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

export default async function ImportarGrupoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin", "coordinador"]);
  const { id } = await params;

  const supabase = await createClient();
  const { data: grupo, error } = await supabase
    .from("grupos")
    .select("id, nombre, dia_semana, hora, status, lugar:lugares!lugar_id(nombre)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo cargar el grupo: ${error.message}`);
  }
  if (!grupo) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/grupos/${grupo.id}`}
          className="text-sm text-neutral-500 transition hover:text-neutral-700"
        >
          ← Volver al grupo
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Importar jugadores</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {grupo.nombre} · {DIA_LABEL[grupo.dia_semana]} {grupo.hora.slice(0, 5)} ·{" "}
          {grupo.lugar?.nombre ?? "—"}
        </p>
      </div>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Pegá la lista del WhatsApp
        </h2>
        <div className="mt-3 space-y-3 text-sm text-neutral-700">
          <p>
            Una línea por jugador con formato{" "}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">celular,Nombre</code>. El
            celular son <strong>los 10 dígitos AR</strong> (código de área + número, sin 0 ni 15).
            Aceptamos también con espacios, guiones, prefijo <code>+54</code> o el 9 móvil; los
            normalizamos. Ejemplo:
          </p>
          <pre className="overflow-x-auto rounded-md bg-neutral-50 px-3 py-2 text-xs leading-relaxed text-neutral-700">
            {`1155551234,Juan Pérez
3514567890,Diego López
2235550101,Martín Sánchez`}
          </pre>
          <p className="text-xs text-neutral-500">
            Los links generados son válidos por 30 días. Si el jugador ya está registrado o ya tiene
            un invite pendiente, lo saltea con un aviso.
          </p>
        </div>
        <div className="mt-5">
          <BulkImportForm grupoId={grupo.id} />
        </div>
      </section>
    </div>
  );
}
