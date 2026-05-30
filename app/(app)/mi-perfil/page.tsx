import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

import { DeclineButton } from "./decline-button";
import { JoinConvocatoriaButton } from "./join-convocatoria-button";
import { JoinQueueButton } from "./join-queue-button";
import { UndoDeclineButton } from "./undo-decline-button";

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
  lugar: { nombre: string; maps: string | null } | null;
};

type LineupMember = {
  playerId: string | null;
  rol: "titular" | "suplente";
  orden: number | null;
  nombre: string;
  apodo: string | null;
  isMe: boolean;
  esInvitadoLibre: boolean;
};

type MiEstado =
  | "titular_convo"
  | "suplente_convo"
  | "declinado_convo"
  | "no_anotado_convo"
  | "bajado_grupo";

type ConfirmedTeamMember = {
  playerId: string;
  nombre: string;
  apodo: string | null;
  isGoalkeeper: boolean;
  isMe: boolean;
};

type ConfirmedTeams = {
  fecha: string;
  teamA: ConfirmedTeamMember[];
  teamB: ConfirmedTeamMember[];
};

type GrupoLineup = {
  grupo: GrupoInfo;
  openConv: {
    id: string;
    fecha: string;
    hora: string;
    status: string;
    lugar: { nombre: string; maps: string | null } | null;
  } | null;
  miEstado: MiEstado;
  miOrden: number | null;
  titulares: LineupMember[];
  suplentes: LineupMember[];
  confirmedTeams: ConfirmedTeams | null;
};

// Equipos confirmados del próximo match por grupo (RPC neutral, sin scores).
async function loadConfirmedTeams(
  supabase: SupabaseLike,
  playerId: string,
): Promise<Map<string, ConfirmedTeams>> {
  const byGrupo = new Map<string, ConfirmedTeams>();
  const { data } = await supabase.rpc("get_my_confirmed_match_teams");
  for (const row of data ?? []) {
    if (!row.grupo_id || !row.player_id) continue;
    let entry = byGrupo.get(row.grupo_id);
    if (!entry) {
      entry = { fecha: row.fecha, teamA: [], teamB: [] };
      byGrupo.set(row.grupo_id, entry);
    }
    const member: ConfirmedTeamMember = {
      playerId: row.player_id,
      nombre: row.nombre ?? "—",
      apodo: row.apodo,
      isGoalkeeper: row.is_goalkeeper,
      isMe: row.player_id === playerId,
    };
    if (row.team_label === "A") entry.teamA.push(member);
    else if (row.team_label === "B") entry.teamB.push(member);
  }
  return byGrupo;
}

async function loadLineups(supabase: SupabaseLike, playerId: string): Promise<GrupoLineup[]> {
  // 1. Membresias del player (activas e inactivas).
  const { data: misMembresias } = await supabase
    .from("grupo_membresias")
    .select("grupo_id, tipo, orden, status")
    .eq("player_id", playerId);

  const misRows = misMembresias ?? [];
  if (misRows.length === 0) return [];

  // Equipos confirmados del próximo partido (Bug 7), por grupo.
  const confirmedByGrupo = await loadConfirmedTeams(supabase, playerId);

  // Por grupo, recordamos el estado de membresia en el grupo.
  const grupoMembership = new Map<string, "activo" | "inactivo">();
  for (const m of misRows) {
    const existing = grupoMembership.get(m.grupo_id);
    if (m.status === "activo") {
      grupoMembership.set(m.grupo_id, "activo");
    } else if (existing !== "activo") {
      grupoMembership.set(m.grupo_id, "inactivo");
    }
  }

  const grupoIds = Array.from(grupoMembership.keys());
  if (grupoIds.length === 0) return [];

  // 2. Info de grupos.
  const { data: gruposData } = await supabase
    .from("grupos")
    .select(
      "id, nombre, dia_semana, hora, cupo_titulares, status, lugar:lugares!lugar_id(nombre, ubicacion_maps_url)",
    )
    .in("id", grupoIds);

  const grupoInfoMap = new Map<string, GrupoInfo>();
  for (const g of gruposData ?? []) {
    grupoInfoMap.set(g.id, {
      id: g.id,
      nombre: g.nombre,
      dia_semana: g.dia_semana,
      hora: g.hora,
      cupo_titulares: g.cupo_titulares,
      status: g.status,
      lugar: g.lugar ? { nombre: g.lugar.nombre, maps: g.lugar.ubicacion_maps_url } : null,
    });
  }

  // 3. Convocatorias abiertas con fecha >= hoy, con su roster.
  // (Las canceladas ya no existen: Bug 5 las elimina en vez de persistirlas.)
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: convs } = await supabase
    .from("convocatorias")
    .select("id, fecha, hora, grupo_id, status, lugar:lugares!lugar_id(nombre, ubicacion_maps_url)")
    .in("grupo_id", grupoIds)
    .eq("status", "abierta")
    .gte("fecha", todayIso)
    .order("fecha", { ascending: true });

  type ConvBrief = {
    id: string;
    fecha: string;
    hora: string;
    status: string;
    lugar: { nombre: string; maps: string | null } | null;
  };
  const openConvByGrupo = new Map<string, ConvBrief>();
  for (const c of convs ?? []) {
    if (!c.grupo_id) continue;
    const brief: ConvBrief = {
      id: c.id,
      fecha: c.fecha,
      hora: c.hora,
      status: c.status,
      lugar: c.lugar ? { nombre: c.lugar.nombre, maps: c.lugar.ubicacion_maps_url } : null,
    };
    if (!openConvByGrupo.has(c.grupo_id)) {
      openConvByGrupo.set(c.grupo_id, brief);
    }
  }

  // 4. Roster de cada convocatoria abierta.
  const convIds = Array.from(openConvByGrupo.values()).map((c) => c.id);
  type CPRow = {
    id: string;
    convocatoria_id: string;
    player_id: string | null;
    nombre_libre: string | null;
    attendance_status: string;
    rol_en_convocatoria: "titular" | "suplente";
    orden_suplente: number | null;
  };
  const convRoster = new Map<string, CPRow[]>();
  if (convIds.length > 0) {
    const { data: cpData } = await supabase
      .from("convocatoria_players")
      .select(
        "id, convocatoria_id, player_id, nombre_libre, attendance_status, rol_en_convocatoria, orden_suplente",
      )
      .in("convocatoria_id", convIds);
    for (const cp of cpData ?? []) {
      const list = convRoster.get(cp.convocatoria_id);
      if (list) list.push(cp as CPRow);
      else convRoster.set(cp.convocatoria_id, [cp as CPRow]);
    }
  }

  // 5. Resolver nombres de players via view publica.
  const playerIds = new Set<string>();
  for (const rows of convRoster.values()) {
    for (const r of rows) {
      if (r.player_id) playerIds.add(r.player_id);
    }
  }
  // Para grupos sin convocatoria abierta usamos grupo_membresias activas
  // como fallback (mostrar el roster del grupo). Las cargamos despues.
  const grupoLineupRows = new Map<
    string,
    Array<{ player_id: string; tipo: "titular" | "suplente"; orden: number | null }>
  >();
  const grupoSinConv = grupoIds.filter((id) => !openConvByGrupo.has(id));
  if (grupoSinConv.length > 0) {
    const { data: gmData } = await supabase
      .from("grupo_membresias")
      .select("grupo_id, player_id, tipo, orden")
      .eq("status", "activo")
      .in("grupo_id", grupoSinConv);
    for (const r of gmData ?? []) {
      if (r.tipo !== "titular" && r.tipo !== "suplente") continue;
      playerIds.add(r.player_id);
      const list = grupoLineupRows.get(r.grupo_id);
      const entry = { player_id: r.player_id, tipo: r.tipo, orden: r.orden };
      if (list) list.push(entry);
      else grupoLineupRows.set(r.grupo_id, [entry]);
    }
  }

  const playerById = new Map<string, { nombre: string; apodo: string | null }>();
  const playerIdsList = Array.from(playerIds);
  if (playerIdsList.length > 0) {
    const { data: playersData } = await supabase
      .from("players_public")
      .select("id, nombre, apodo")
      .in("id", playerIdsList);
    for (const p of playersData ?? []) {
      if (p.id) playerById.set(p.id, { nombre: p.nombre ?? "—", apodo: p.apodo ?? null });
    }
  }

  // 6. Construir resultado por grupo.
  const result: GrupoLineup[] = [];
  for (const grupoId of grupoIds) {
    const grupo = grupoInfoMap.get(grupoId);
    if (!grupo) continue;
    if (grupo.status !== "activo") continue;

    const memStatus = grupoMembership.get(grupoId);
    const openConv = openConvByGrupo.get(grupoId) ?? null;

    let titulares: LineupMember[] = [];
    let suplentes: LineupMember[] = [];
    let miEstado: MiEstado;
    let miOrden: number | null = null;

    if (openConv) {
      const roster = convRoster.get(openConv.id) ?? [];
      const activeRoster = roster.filter((r) => r.attendance_status !== "declinado");

      titulares = activeRoster
        .filter((r) => r.rol_en_convocatoria === "titular")
        .map((r) => {
          const esInvitado = r.player_id === null;
          const info = esInvitado
            ? { nombre: r.nombre_libre ?? "—", apodo: null }
            : (playerById.get(r.player_id!) ?? { nombre: "—", apodo: null });
          return {
            playerId: r.player_id,
            rol: "titular" as const,
            orden: null,
            nombre: info.nombre,
            apodo: info.apodo,
            isMe: r.player_id !== null && r.player_id === playerId,
            esInvitadoLibre: esInvitado,
          };
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

      suplentes = activeRoster
        .filter((r) => r.rol_en_convocatoria === "suplente")
        .map((r) => {
          const esInvitado = r.player_id === null;
          const info = esInvitado
            ? { nombre: r.nombre_libre ?? "—", apodo: null }
            : (playerById.get(r.player_id!) ?? { nombre: "—", apodo: null });
          return {
            playerId: r.player_id,
            rol: "suplente" as const,
            orden: r.orden_suplente,
            nombre: info.nombre,
            apodo: info.apodo,
            isMe: r.player_id !== null && r.player_id === playerId,
            esInvitadoLibre: esInvitado,
          };
        })
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

      const myConvRow = roster.find((r) => r.player_id === playerId);
      if (memStatus === "inactivo") {
        miEstado = "bajado_grupo";
      } else if (myConvRow && myConvRow.attendance_status === "declinado") {
        miEstado = "declinado_convo";
      } else if (myConvRow && myConvRow.rol_en_convocatoria === "titular") {
        miEstado = "titular_convo";
      } else if (myConvRow && myConvRow.rol_en_convocatoria === "suplente") {
        miEstado = "suplente_convo";
        miOrden = myConvRow.orden_suplente;
      } else {
        // Miembro activo del grupo pero no figura en el roster de la conv.
        // Tipico cuando declino la conv anterior. Puede anotarse.
        miEstado = "no_anotado_convo";
      }
    } else {
      // Sin convocatoria abierta: mostrar roster del grupo como referencia.
      const lineupRows = grupoLineupRows.get(grupoId) ?? [];
      titulares = lineupRows
        .filter((r) => r.tipo === "titular")
        .map((r) => {
          const info = playerById.get(r.player_id) ?? { nombre: "—", apodo: null };
          return {
            playerId: r.player_id,
            rol: "titular" as const,
            orden: null,
            nombre: info.nombre,
            apodo: info.apodo,
            isMe: r.player_id === playerId,
            esInvitadoLibre: false,
          };
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
      suplentes = lineupRows
        .filter((r) => r.tipo === "suplente")
        .map((r) => {
          const info = playerById.get(r.player_id) ?? { nombre: "—", apodo: null };
          return {
            playerId: r.player_id,
            rol: "suplente" as const,
            orden: r.orden,
            nombre: info.nombre,
            apodo: info.apodo,
            isMe: r.player_id === playerId,
            esInvitadoLibre: false,
          };
        })
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

      if (memStatus === "inactivo") {
        miEstado = "bajado_grupo";
      } else {
        const myRow = lineupRows.find((r) => r.player_id === playerId);
        if (myRow?.tipo === "titular") {
          miEstado = "titular_convo";
        } else if (myRow?.tipo === "suplente") {
          miEstado = "suplente_convo";
          miOrden = myRow.orden;
        } else {
          miEstado = "bajado_grupo";
        }
      }
    }

    result.push({
      grupo,
      openConv,
      miEstado,
      miOrden,
      titulares,
      suplentes,
      confirmedTeams: confirmedByGrupo.get(grupoId) ?? null,
    });
  }

  result.sort((a, b) => {
    // Primero los que tienen conv proxima, ordenados por fecha ascendente.
    // Despues los que no tienen conv (orden por dia_semana habitual).
    const aFecha = a.openConv?.fecha ?? null;
    const bFecha = b.openConv?.fecha ?? null;
    if (aFecha && bFecha) return aFecha.localeCompare(bFecha);
    if (aFecha) return -1;
    if (bFecha) return 1;
    return a.grupo.dia_semana - b.grupo.dia_semana;
  });
  return result;
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
  if (player) {
    lineups = await loadLineups(supabase, player.id);
  }

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

      <p className="text-xs text-neutral-500">
        <Link href="/perfil" className="underline">
          Cambiar mi contraseña
        </Link>
      </p>
    </div>
  );
}

function ConfirmedTeamColumn({
  label,
  members,
}: {
  label: string;
  members: ConfirmedTeamMember[];
}) {
  return (
    <div className="rounded bg-white p-2 ring-1 ring-emerald-100">
      <p className="text-xs font-semibold text-emerald-900">{label}</p>
      {members.length === 0 ? (
        <p className="mt-1 text-xs text-neutral-500">Sin jugadores.</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {members.map((m) => (
            <li
              key={m.playerId}
              className={`text-sm ${m.isMe ? "font-semibold text-emerald-900" : "text-neutral-800"}`}
            >
              {m.isGoalkeeper ? (
                <span className="mr-1" title="Arquero">
                  🧤
                </span>
              ) : null}
              {m.nombre}
              {m.apodo ? <span className="ml-1 text-xs text-neutral-500">({m.apodo})</span> : null}
              {m.isMe ? <span className="ml-1 text-xs text-emerald-700">· vos</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GrupoCard({ lineup }: { lineup: GrupoLineup }) {
  const { grupo, openConv, miEstado, miOrden, titulares, suplentes, confirmedTeams } = lineup;
  const dia = DIA_LABEL[grupo.dia_semana];
  const hora = formatHora(grupo.hora);

  const miLabel =
    miEstado === "titular_convo"
      ? "Sos titular"
      : miEstado === "suplente_convo"
        ? `Sos suplente #${miOrden ?? "?"}`
        : miEstado === "declinado_convo"
          ? "Te bajaste de este partido"
          : miEstado === "no_anotado_convo"
            ? "No anotado"
            : "Te bajaste del grupo";

  const miBadgeClass =
    miEstado === "titular_convo"
      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
      : miEstado === "suplente_convo"
        ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
        : miEstado === "declinado_convo"
          ? "bg-red-50 text-red-700 ring-1 ring-red-200"
          : miEstado === "no_anotado_convo"
            ? "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200"
            : "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";

  // Lugar del partido: prioridad de la convocatoria, fallback al del grupo.
  const lugarPartido = openConv?.lugar ?? grupo.lugar;
  const horaPartido = openConv?.hora ? formatHora(openConv.hora) : hora;

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-neutral-900">{grupo.nombre}</h2>
          <p className="text-xs text-neutral-500">
            {dia} {hora} habitual · cupo {grupo.cupo_titulares}
          </p>
          {openConv ? (
            <>
              <p className="mt-1 text-sm font-medium text-neutral-900">
                Próximo partido: {formatFecha(openConv.fecha)} · {horaPartido}
              </p>
              <p className="text-xs text-neutral-700">{lugarPartido?.nombre ?? "Sin lugar"}</p>
              {lugarPartido?.maps ? (
                <a
                  href={lugarPartido.maps}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-block text-xs text-neutral-700 underline transition hover:text-neutral-900"
                >
                  Ver en Maps ↗
                </a>
              ) : null}
            </>
          ) : (
            <>
              <p className="mt-1 text-xs text-neutral-700">
                {grupo.lugar?.nombre ?? "Sin lugar definido"}
              </p>
              {grupo.lugar?.maps ? (
                <a
                  href={grupo.lugar.maps}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-block text-xs text-neutral-700 underline transition hover:text-neutral-900"
                >
                  Ver en Maps ↗
                </a>
              ) : null}
            </>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${miBadgeClass}`}>
          {miLabel}
        </span>
      </div>

      {miEstado === "declinado_convo" && openConv ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-xs text-red-800">
            Avisaste que no vas a este partido. Si querés volver, entrás como titular si hay cupo o
            al final de la cola de suplentes.
          </p>
          <div className="mt-2">
            <UndoDeclineButton convocatoriaId={openConv.id} label="Volver al partido" />
          </div>
        </div>
      ) : null}

      {miEstado === "no_anotado_convo" && openConv ? (
        <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-xs text-neutral-700">
            Estás en el grupo pero todavía no te anotaste a este partido. Si querés ir, entrás como
            titular si hay cupo o al final de la cola de suplentes.
          </p>
          <div className="mt-2">
            <JoinConvocatoriaButton convocatoriaId={openConv.id} label="Me anoto" />
          </div>
        </div>
      ) : null}

      {miEstado === "bajado_grupo" ? (
        <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-xs text-neutral-600">
            Te bajaste de este grupo. Podés volver ahora: si hay cupo entrás como titular, si no
            como suplente al final de la cola.
          </p>
          <div className="mt-2">
            <JoinQueueButton grupoId={grupo.id} label="Volver al grupo" />
          </div>
        </div>
      ) : null}

      {(miEstado === "titular_convo" || miEstado === "suplente_convo") && openConv ? (
        <div className="mt-4 rounded-md border border-neutral-200 bg-white p-3">
          <DeclineButton convocatoriaId={openConv.id} label="No voy a este partido" />
          <p className="mt-2 text-xs text-neutral-500">
            {miEstado === "titular_convo"
              ? "Si te bajás, el primer suplente sube a titular."
              : "Si te bajás, la cola se acomoda. Podés volver más tarde."}
          </p>
        </div>
      ) : null}

      {confirmedTeams ? (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50/40 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            Equipos del próximo partido · {formatFecha(confirmedTeams.fecha)}
          </h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <ConfirmedTeamColumn label="Equipo A" members={confirmedTeams.teamA} />
            <ConfirmedTeamColumn label="Equipo B" members={confirmedTeams.teamB} />
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Titulares ({titulares.length}/{grupo.cupo_titulares})
          </h3>
          {titulares.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-500">Sin titulares.</p>
          ) : (
            <ol className="mt-2 space-y-1">
              {titulares.map((m, i) => (
                <li
                  key={m.playerId ?? `libre-${i}`}
                  className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${
                    m.isMe ? "bg-emerald-50 font-semibold text-emerald-900" : "text-neutral-800"
                  }`}
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                    {i + 1}
                  </span>
                  <span>
                    {m.nombre}
                    {m.apodo ? (
                      <span className="ml-1 text-xs text-neutral-500">({m.apodo})</span>
                    ) : null}
                    {m.esInvitadoLibre ? (
                      <span className="ml-1 text-xs text-neutral-500">(invitado)</span>
                    ) : null}
                    {m.isMe ? <span className="ml-2 text-xs text-emerald-700">· vos</span> : null}
                  </span>
                </li>
              ))}
            </ol>
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
              {suplentes.map((m, i) => (
                <li
                  key={m.playerId ?? `libre-${i}`}
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
                    {m.esInvitadoLibre ? (
                      <span className="ml-1 text-xs text-neutral-500">(invitado)</span>
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
