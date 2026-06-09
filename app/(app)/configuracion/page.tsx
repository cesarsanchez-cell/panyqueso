import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

import { VeedorGateToggle } from "./toggle";

export default async function ConfiguracionPage() {
  await requireRole("admin");

  const supabase = await createClient();
  const { data } = await supabase.rpc("requiere_veedor");
  const requiereVeedor = data === true;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Configuración</h1>
        <p className="mt-1 text-sm text-neutral-600">Ajustes generales del grupo.</p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Auditoría del veedor
          </h2>
          <p className="mt-2 text-sm text-neutral-600">
            Con la auditoría <span className="font-medium">activada</span>, cada cambio de rating
            (alta y edición de jugadores) lo propone el admin y lo aprueba un veedor. En grupos
            chicos eso puede demorar de más: si la <span className="font-medium">desactivás</span>,
            el admin aplica los cambios directo. En ambos casos queda la traza registrada en el
            historial del jugador.
          </p>
        </div>

        <VeedorGateToggle initial={requiereVeedor} />
      </section>
    </div>
  );
}
