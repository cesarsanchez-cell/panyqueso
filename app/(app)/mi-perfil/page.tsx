import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

import { DeclineButton } from "./decline-button";
import { JoinQueueButton } from "./join-queue-button";

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

function formatFecha(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

const TIPO_LABEL = {
  titular: "Titular",
  suplente: "Suplente",
} as const;

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

async function loadMembresiasActivas(supabase: SupabaseLike, playerId: string) {
  const { data, error } = await supabase
    .from("grupo_membresias")
    .select(
      "id, tipo, orden, status, grupo:grupos!grupo_id(id, nombre, dia_semana, hora, cupo_titulares, lugar:lugares!lugar_id(nombre))",
    )
    .eq("status", "activo")
    .eq("player_id", playerId)
    .order("tipo", { ascending: true })
    .order("orden", { ascending: true, nullsFirst: true });

  if (error) {
    throw new Error(`No se pudieron cargar tus grupos: ${error.message}`);
  }
  return data ?? [];
}

async function loadGruposInactivos(supabase: SupabaseLike, playerId: string) {
  // Grupos donde el player tiene membresia inactiva (ex titular o ex suplente)
  // Y todavia no tiene una activa. Excluimos grupos archivados.
  const { data, error } = await supabase
    .from("grupo_membresias")
    .select(
      "id, status, grupo:grupos!grupo_id(id, nombre, dia_semana, hora, status, lugar:lugares!lugar_id(nombre))",
    )
    .eq("status", "inactivo")
    .eq("player_id", playerId);

  if (error) {
    throw new Error(`No se pudieron cargar grupos inactivos: ${error.message}`);
  }
  return data ?? [];
}

async function loadNextConvocatoria(supabase: SupabaseLike, playerId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("convocatoria_players")
    .select(
      "id, attendance_status, convocatoria:convocatorias!convocatoria_id(id, fecha, status, grupo:grupos!grupo_id(id, nombre, dia_semana, hora, lugar:lugares!lugar_id(nombre)))",
    )
    .eq("player_id", playerId)
    .in("attendance_status", ["pendiente", "confirmado"])
    .order("convocatoria(fecha)", { ascending: true });

  if (error) {
    throw new Error(`No se pudo cargar tu próxima convocatoria: ${error.message}`);
  }
  if (!data) return null;

  // Filtramos en memoria: convocatorias abiertas, fecha >= hoy.
  const upcoming = data.find((row) => {
    const c = row.convocatoria;
    if (!c) return false;
    if (c.status === "cancelada") return false;
    return c.fecha >= today;
  });
  return upcoming ?? null;
}

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

  let gruposActivos: Awaited<ReturnType<typeof loadMembresiasActivas>> = [];
  let gruposInactivos: Awaited<ReturnType<typeof loadGruposInactivos>> = [];
  let nextConv: Awaited<ReturnType<typeof loadNextConvocatoria>> = null;
  if (player) {
    [gruposActivos, gruposInactivos, nextConv] = await Promise.all([
      loadMembresiasActivas(supabase, player.id),
      loadGruposInactivos(supabase, player.id),
      loadNextConvocatoria(supabase, player.id),
    ]);
  }

  // Filtrar inactivos: solo grupos cuyo status='activo' (no archivados) y
  // donde el player NO tiene una membresia activa simultanea.
  const activeGrupoIds = new Set(gruposActivos.map((m) => m.grupo?.id).filter(Boolean));
  const reJoinable = gruposInactivos.filter((m) => {
    if (!m.grupo) return false;
    if (m.grupo.status !== "activo") return false;
    if (activeGrupoIds.has(m.grupo.id)) return false;
    return true;
  });

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

      {nextConv && nextConv.convocatoria ? (
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Tu próximo partido
          </h2>
          <div className="mt-3 space-y-1">
            <p className="text-base font-semibold text-neutral-900">
              {nextConv.convocatoria.grupo?.nombre ?? "Partido"}
            </p>
            <p className="text-sm text-neutral-700">
              {formatFecha(nextConv.convocatoria.fecha)}
              {nextConv.convocatoria.grupo
                ? ` · ${formatHora(nextConv.convocatoria.grupo.hora)} · ${
                    nextConv.convocatoria.grupo.lugar?.nombre ?? "—"
                  }`
                : ""}
            </p>
          </div>
          <div className="mt-4">
            <DeclineButton
              convocatoriaId={nextConv.convocatoria.id}
              label="No voy a este partido"
            />
            <p className="mt-2 text-xs text-neutral-500">
              Si te bajás siendo titular, tu lugar pasa al primer suplente.
            </p>
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Tus grupos
          </h2>
          <p className="text-sm text-neutral-700">
            {gruposActivos.length} {gruposActivos.length === 1 ? "grupo" : "grupos"}
          </p>
        </div>
        {gruposActivos.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            Todavía no estás en ningún grupo activo. Si te invitaron por un link de WhatsApp y ya
            completaste tu alta, esperá unos segundos y refrescá.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100">
            {gruposActivos.map((m) => {
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

      {reJoinable.length > 0 ? (
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Anotarme en la cola
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Te bajaste de estos grupos. Podés volver a sumarte como suplente al final de la cola.
          </p>
          <ul className="mt-3 space-y-3">
            {reJoinable.map((m) => {
              const g = m.grupo;
              if (!g) return null;
              const dia = DIA_LABEL[g.dia_semana];
              const hora = formatHora(g.hora);
              return (
                <li
                  key={m.id}
                  className="flex flex-col gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-900">{g.nombre}</p>
                    <p className="text-xs text-neutral-500">
                      {dia} {hora} · {g.lugar?.nombre ?? "—"}
                    </p>
                  </div>
                  <div className="sm:w-56">
                    <JoinQueueButton grupoId={g.id} label="Anotarme en la cola" />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <p className="text-xs text-neutral-500">
        <Link href="/perfil" className="underline">
          Cambiar mi contraseña
        </Link>
      </p>
    </div>
  );
}
