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
    .select("liderazgo_coef_positivo, liderazgo_coef_negativo")
    .maybeSingle();

  const positivo = Number(settings?.liderazgo_coef_positivo ?? 1);
  const negativo = Number(settings?.liderazgo_coef_negativo ?? 1);

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
          Un líder <strong>positivo</strong> organiza y mejora a su equipo: multiplica su score por
          el coef positivo (no acumulativo, si hay dos cuenta uno). Un <strong>negativo</strong>{" "}
          (quejoso) molesta a sus compañeros: multiplica por el coef negativo y{" "}
          <strong>sí acumula</strong> (dos quejosos = coef²). <strong>1.00</strong> en ambos = sin
          efecto. Empezá en 1.00 y ajustá de a poco a medida que veas cómo influye.
        </p>

        <LiderazgoCoefForm positivo={positivo} negativo={negativo} />
      </section>
    </div>
  );
}
