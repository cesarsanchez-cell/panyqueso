import { requireRole } from "@/lib/auth/require-role";
import { formatArLocal } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

import { VeedoresList, type VeedorCandidate } from "./veedores-list";

export default async function VeedoresPage() {
  await requireRole("admin");

  const supabase = await createClient();
  const { data } = await supabase.rpc("listar_perfiles_para_veedor");

  const candidates: VeedorCandidate[] = (data ?? []).map((r) => ({
    profileId: r.profile_id,
    nombre: r.nombre?.trim() || "—",
    phone: r.phone ? formatArLocal(r.phone) : null,
    esVeedor: r.es_veedor === true,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Veedores</h1>
        <p className="mt-1 text-sm text-neutral-600">
          El veedor revisa y aprueba los cambios de rating sensibles. Es un rango global (para todos
          los grupos). Un veedor también puede jugar: conserva su ficha de jugador.
        </p>
      </div>

      <VeedoresList candidates={candidates} />

      <p className="text-xs text-neutral-500">
        Los admin y coordinadores no aparecen en esta lista (tienen otro rango). Para hacer veedor a
        un coordinador, primero quitale la coordinación.
      </p>
    </div>
  );
}
