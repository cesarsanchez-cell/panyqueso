import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

import { LiderazgoCoefForm } from "./liderazgo-coef-form";

// Configuración global del producto. Admin-only (el coordinador no toca params
// globales). Hoy: coeficientes de potenciación por líder (FUT-127).
export default async function ConfiguracionPage() {
  await requireRole(["admin"]);

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("app_settings")
    .select("liderazgo_coef_medio, liderazgo_coef_alto")
    .maybeSingle();

  const medio = Number(settings?.liderazgo_coef_medio ?? 1);
  const alto = Number(settings?.liderazgo_coef_alto ?? 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Configuración</h1>
        <p className="mt-1 text-sm text-neutral-500">Parámetros globales del armado de equipos.</p>
      </div>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Liderazgo: potenciación de equipo
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Un jugador con liderazgo (medio/alto) organiza y mejora a su equipo. En el armado, el
          equipo que tiene un líder multiplica su score por este coeficiente (no acumulativo: si hay
          dos líderes, solo cuenta el de mayor coeficiente). <strong>1.00</strong> = sin efecto.
          Empezá en 1.00 y ajustá de a poco a medida que veas cómo influye.
        </p>

        <LiderazgoCoefForm medio={medio} alto={alto} />
      </section>
    </div>
  );
}
