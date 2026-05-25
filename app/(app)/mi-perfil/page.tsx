import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

type SearchParams = { welcome?: string };

const DIA_LABEL = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

function formatHora(raw: string): string {
  return raw.slice(0, 5);
}

const TIPO_LABEL = {
  titular: "Titular",
  suplente: "Suplente",
} as const;

export default async function MiPerfilPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requireUser();
  const sp = await searchParams;

  // Solo para players. Admin/veedor no tienen contexto aca.
  if (ctx.profile.role !== "player") {
    redirect("/");
  }

  const supabase = await createClient();

  const { data: player } = await supabase
    .from("players")
    .select("id, nombre, status, apodo")
    .eq("auth_user_id", ctx.userId)
    .maybeSingle();

  const { data: membresias, error: memErr } = await supabase
    .from("grupo_membresias")
    .select(
      "id, tipo, orden, status, grupo:grupos!grupo_id(id, nombre, dia_semana, hora, cupo_titulares, lugar:lugares!lugar_id(nombre))",
    )
    .eq("status", "activo")
    .order("tipo", { ascending: true })
    .order("orden", { ascending: true, nullsFirst: true });

  if (memErr) {
    throw new Error(`No se pudieron cargar tus grupos: ${memErr.message}`);
  }

  const grupos = membresias ?? [];

  return (
    <div className="space-y-6">
      {sp.welcome === "1" ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          ¡Bienvenido! Tu cuenta quedó creada. El organizador te va a aprobar las calificaciones
          internas en las próximas horas.
        </div>
      ) : null}

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          Hola{player?.nombre ? `, ${player.nombre.split(" ")[0]}` : ""}.
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          {player?.status === "approved"
            ? "Tu perfil está aprobado y podés ser convocado a los partidos."
            : "Tu perfil está pendiente de aprobación del organizador. Igual ya quedaste agregado a tus grupos."}
        </p>
      </div>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Tus grupos
          </h2>
          <p className="text-sm text-neutral-700">
            {grupos.length} {grupos.length === 1 ? "grupo" : "grupos"}
          </p>
        </div>
        {grupos.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            Todavía no estás en ningún grupo activo. Si te invitaron por un link de WhatsApp y ya
            completaste tu alta, esperá unos segundos y refrescá.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100">
            {grupos.map((m) => {
              const g = m.grupo;
              if (!g) return null;
              const dia = DIA_LABEL[g.dia_semana];
              const hora = formatHora(g.hora);
              const tipoLabel = m.tipo === "titular" ? TIPO_LABEL.titular : TIPO_LABEL.suplente;
              return (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-900">{g.nombre}</p>
                    <p className="text-xs text-neutral-500">
                      {dia} {hora} · {g.lugar?.nombre ?? "—"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        m.tipo === "titular"
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                          : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                      }`}
                    >
                      {tipoLabel}
                      {m.tipo === "suplente" && m.orden ? ` #${m.orden}` : ""}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-5 text-sm text-neutral-600">
        <p className="font-medium text-neutral-700">Pronto vas a poder:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
          <li>Cambiar tu password y completar más datos (apodo, pierna hábil, foto).</li>
          <li>Avisar &quot;no voy&quot; a cada partido desde acá.</li>
          <li>Ver el historial de partidos jugados.</li>
        </ul>
        <p className="mt-3 text-xs text-neutral-500">
          Por ahora, si necesitás cambiar algo o no podés ir, avisale por WhatsApp al organizador.
        </p>
      </section>

      <p className="text-xs text-neutral-500">
        <Link href="/perfil" className="underline">
          Cambiar mi contraseña
        </Link>
      </p>
    </div>
  );
}
