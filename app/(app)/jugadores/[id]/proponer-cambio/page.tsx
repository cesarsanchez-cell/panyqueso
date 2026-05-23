import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

import { EditForm } from "./edit-form";

export default async function ProponerCambioPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");

  const { id } = await params;

  const supabase = await createClient();
  const { data: player, error } = await supabase
    .from("players")
    .select(
      "id, nombre, edad, role_field, position_pref, technical, physical, mental, rating_confidence",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo cargar el jugador: ${error.message}`);
  }
  if (!player) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/jugadores/${id}`}
          className="text-sm text-neutral-500 transition hover:text-neutral-700"
        >
          ← Volver al detalle
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          Proponer cambio — {player.nombre}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          El cambio queda como solicitud pendiente hasta que un veedor la apruebe. Modificá solo los
          campos que querés cambiar.
        </p>
      </div>

      <EditForm
        initial={{
          id: player.id,
          edad: player.edad,
          role_field: player.role_field,
          position_pref: player.position_pref,
          technical: player.technical,
          physical: player.physical,
          mental: player.mental,
          rating_confidence: player.rating_confidence,
        }}
      />
    </div>
  );
}
