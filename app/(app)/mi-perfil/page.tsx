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

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

type GrupoInfo = {
  id: string;
  nombre: string;
  dia_semana: number;
  hora: string;
  cupo_titulares: number;
  status: string;
  lugar: { nombre: string } | null;
};

type LineupMember = {
  membresiaId: string;
  playerId: string;
  tipo: "titular" | "suplente";
  orden: number | null;
  nombre: string;
  apodo: string | null;
  isMe: boolean;
};

type GrupoLineup = {
  grupo: GrupoInfo;
  miTipo: "titular" | "suplente";
  miOrden: number | null;
  titulares: LineupMember[];
  suplentes: LineupMember[];
};

async function loadLineups(supabase: SupabaseLike, playerId: string): Promise<GrupoLineup[]> {
  // 1. Grupos donde el player tiene membresia activa.
  const { data: misMembresias } = await supabase
    .from("grupo_membresias")
    .select("grupo_id, tipo, orden")
    .eq("player_id", playerId)
    .eq("status", "activo");

  const misRows = misMembresias ?? [];
  if (misRows.length === 0) return [];

  const grupoIds = misRows.map((m) => m.grupo_id);

  // 2. Todas las membresias activas de esos grupos (lineup completo).
  const { data: lineup } = await supabase
    .from("grupo_membresias")
    .select(
      "id, grupo_id, tipo, orden, player_id, grupo:grupos!grupo_id(id, nombre, dia_semana, hora, cupo_titulares, status, lugar:lugares!lugar_id(nombre))",
    )
    .eq("status", "activo")
    .in("grupo_id", grupoIds);

  const lineupRows = lineup ?? [];
  if (lineupRows.length === 0) return [];

  // 3. Players (via view publica, sin ratings ni datos sensibles).
  const playerIds = Array.from(new Set(lineupRows.map((r) => r.player_id)));
  const { data: playersData } = await supabase
    .from("players_public")
    .select("id, nombre, apodo")
    .in("id", playerIds);

  const playerById = new Map<string, { nombre: string; apodo: string | null }>();
  for (const p of playersData ?? []) {
    if (p.id) playerById.set(p.id, { nombre: p.nombre ?? "—", apodo: p.apodo ?? null });
  }

  // 4. Agrupar por grupo.
  const groupMap = new Map<
    string,
    {
      grupo: GrupoInfo;
      members: LineupMember[];
      mine: { tipo: "titular" | "suplente"; orden: number | null };
    }
  >();

  // Pre-cargar la info propia para saber tipo + orden en cada grupo.
  const mineByGrupo = new Map<string, { tipo: "titular" | "suplente"; orden: number | null }>();
  for (const m of misRows) {
    if (m.tipo === "titular" || m.tipo === "suplente") {
      mineByGrupo.set(m.grupo_id, { tipo: m.tipo, orden: m.orden });
    }
  }

  for (const row of lineupRows) {
    if (!row.grupo) continue;
    if (row.tipo !== "titular" && row.tipo !== "suplente") continue;
    const playerInfo = playerById.get(row.player_id) ?? { nombre: "—", apodo: null };
    const member: LineupMember = {
      membresiaId: row.id,
      playerId: row.player_id,
      tipo: row.tipo,
      orden: row.orden,
      nombre: playerInfo.nombre,
      apodo: playerInfo.apodo,
      isMe: row.player_id === playerId,
    };

    const existing = groupMap.get(row.grupo_id);
    if (existing) {
      existing.members.push(member);
    } else {
      const mine = mineByGrupo.get(row.grupo_id);
      if (!mine) continue;
      groupMap.set(row.grupo_id, {
        grupo: {
          id: row.grupo.id,
          nombre: row.grupo.nombre,
          dia_semana: row.grupo.dia_semana,
          hora: row.grupo.hora,
          cupo_titulares: row.grupo.cupo_titulares,
          status: row.grupo.status,
          lugar: row.grupo.lugar ? { nombre: row.grupo.lugar.nombre } : null,
        },
        members: [member],
        mine,
      });
    }
  }

  // 5. Separar titulares (alfabetico) y suplentes (FIFO) por grupo.
  const result: GrupoLineup[] = [];
  for (const [, g] of groupMap) {
    const titulares = g.members
      .filter((m) => m.tipo === "titular")
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const suplentes = g.members
      .filter((m) => m.tipo === "suplente")
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    result.push({
      grupo: g.grupo,
      miTipo: g.mine.tipo,
      miOrden: g.mine.orden,
      titulares,
      suplentes,
    });
  }

  result.sort((a, b) => a.grupo.dia_semana - b.grupo.dia_semana);
  return result;
}

async function loadGruposInactivos(supabase: SupabaseLike, playerId: string) {
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

  if (ctx.profile.role !== "player") {
    redirect("/");
  }

  const supabase = await createClient();

  const { data: playerRows } = await supabase.rpc("get_my_player_summary");
  const player = playerRows && playerRows.length > 0 ? playerRows[0] : null;

  let lineups: GrupoLineup[] = [];
  let gruposInactivos: Awaited<ReturnType<typeof loadGruposInactivos>> = [];
  let nextConv: Awaited<ReturnType<typeof loadNextConvocatoria>> = null;
  if (player) {
    [lineups, gruposInactivos, nextConv] = await Promise.all([
      loadLineups(supabase, player.id),
      loadGruposInactivos(supabase, player.id),
      loadNextConvocatoria(supabase, player.id),
    ]);
  }

  const activeGrupoIds = new Set(lineups.map((l) => l.grupo.id));
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

      {lineups.length === 0 ? (
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Tus grupos
          </h2>
          <p className="mt-3 text-sm text-neutral-500">
            Todavía no estás en ningún grupo activo. Si te invitaron por un link de WhatsApp y ya
            completaste tu alta, esperá unos segundos y refrescá.
          </p>
        </section>
      ) : (
        lineups.map((l) => <GrupoCard key={l.grupo.id} lineup={l} />)
      )}

      {reJoinable.length > 0 ? (
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Volver al grupo
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Te bajaste de estos grupos. Podés volver a sumarte ahora; si hay cupo entrás como
            titular, si no como suplente al final de la cola.
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
                    <JoinQueueButton grupoId={g.id} label="Volver al grupo" />
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

function GrupoCard({ lineup }: { lineup: GrupoLineup }) {
  const { grupo, miTipo, miOrden, titulares, suplentes } = lineup;
  const dia = DIA_LABEL[grupo.dia_semana];
  const hora = formatHora(grupo.hora);
  const miLabel = miTipo === "titular" ? "Sos titular" : `Sos suplente #${miOrden ?? "?"}`;
  const miBadgeClass =
    miTipo === "titular"
      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
      : "bg-amber-50 text-amber-700 ring-1 ring-amber-200";

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-neutral-900">{grupo.nombre}</h2>
          <p className="text-xs text-neutral-500">
            {dia} {hora} · {grupo.lugar?.nombre ?? "—"} · cupo {grupo.cupo_titulares}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${miBadgeClass}`}>
          {miLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Titulares ({titulares.length}/{grupo.cupo_titulares})
          </h3>
          {titulares.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-500">Sin titulares.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {titulares.map((m) => (
                <li
                  key={m.membresiaId}
                  className={`rounded px-2 py-1 text-sm ${
                    m.isMe ? "bg-emerald-50 font-semibold text-emerald-900" : "text-neutral-800"
                  }`}
                >
                  {m.nombre}
                  {m.apodo ? (
                    <span className="ml-1 text-xs text-neutral-500">({m.apodo})</span>
                  ) : null}
                  {m.isMe ? <span className="ml-2 text-xs text-emerald-700">· vos</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Cola de suplentes ({suplentes.length})
          </h3>
          {suplentes.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-500">Sin suplentes.</p>
          ) : (
            <ol className="mt-2 space-y-1">
              {suplentes.map((m) => (
                <li
                  key={m.membresiaId}
                  className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${
                    m.isMe ? "bg-amber-50 font-semibold text-amber-900" : "text-neutral-800"
                  }`}
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-700">
                    {m.orden ?? "?"}
                  </span>
                  <span>
                    {m.nombre}
                    {m.apodo ? (
                      <span className="ml-1 text-xs text-neutral-500">({m.apodo})</span>
                    ) : null}
                    {m.isMe ? <span className="ml-2 text-xs text-amber-700">· vos</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
