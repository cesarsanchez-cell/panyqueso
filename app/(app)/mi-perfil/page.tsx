import Link from "next/link";
import { redirect } from "next/navigation";

import { ClubCrest } from "@/components/club-crest";
import { requireUser } from "@/lib/auth/require-role";
import { playerLabel } from "@/lib/players/label";
import { createClient } from "@/lib/supabase/server";

import { PlayerAvatar } from "../player-avatar";
import { DeclineButton } from "./decline-button";
import { JoinConvocatoriaButton } from "./join-convocatoria-button";
import { JoinQueueButton } from "./join-queue-button";
import { NotificationsCard } from "./notifications-card";
import { ProdeForm, type ProdeInfo } from "./prode-form";
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
  avatarUrl: string | null;
  clubId: string | null;
  isMe: boolean;
  esInvitadoLibre: boolean;
};

type MiEstado =
  | "titular_convo"
  | "suplente_convo"
  | "declinado_convo"
  | "no_anotado_convo"
  | "bajado_grupo"
  | "sin_convocatoria";

type ConfirmedTeamMember = {
  playerId: string;
  nombre: string;
  apodo: string | null;
  isGoalkeeper: boolean;
  isMe: boolean;
  avatarUrl: string | null;
  clubId: string | null;
};

// Indicador neutro de balance (sin números): parejos, o qué equipo viene un
// toque abajo. Sale del RPC, que lo calcula server-side sin exponer ratings.
type BalanceHint = "parejos" | "equipo_A_abajo" | "equipo_B_abajo";

type ConfirmedTeams = {
  fecha: string;
  teamA: ConfirmedTeamMember[];
  teamB: ConfirmedTeamMember[];
  // Suplentes que no entraron a ningún equipo (entran solo si baja alguien).
  bench: ConfirmedTeamMember[];
  balanceHint: BalanceHint | null;
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
  prode: ProdeInfo | null;
};

// El Prode del próximo match confirmado por grupo (RPC neutral). Para los que ya
// cerraron, además trae el reveal de todos los pronósticos.
async function loadProde(supabase: SupabaseLike): Promise<Map<string, ProdeInfo>> {
  const byGrupo = new Map<string, ProdeInfo>();
  const { data } = await supabase.rpc("get_my_prode");
  for (const row of data ?? []) {
    if (!row.grupo_id || !row.match_id) continue;
    byGrupo.set(row.grupo_id, {
      matchId: row.match_id,
      abierto: row.abierto,
      kickoff: row.kickoff,
      miPredA: row.mi_pred_a,
      miPredB: row.mi_pred_b,
      resultA: row.result_a,
      resultB: row.result_b,
      predicciones: [],
    });
  }
  // Reveal: para los matches con prode ya cerrado, traer todos los pronósticos.
  for (const info of byGrupo.values()) {
    if (info.abierto) continue;
    const { data: preds } = await supabase.rpc("get_prode_predictions", {
      p_match_id: info.matchId,
    });
    info.predicciones = (preds ?? []).map((p) => ({
      playerId: p.player_id,
      nombre: p.nombre ?? "—",
      apodo: p.apodo,
      predA: p.pred_a,
      predB: p.pred_b,
      puntos: p.puntos,
      esMio: p.es_mio,
    }));
  }
  return byGrupo;
}

// Equipos confirmados del próximo match por grupo (RPC neutral, sin scores).
async function loadConfirmedTeams(
  supabase: SupabaseLike,
  playerId: string,
): Promise<Map<string, ConfirmedTeams>> {
  const byGrupo = new Map<string, ConfirmedTeams>();
  const { data } = await supabase.rpc("get_my_confirmed_match_teams");
  const allMembers: ConfirmedTeamMember[] = [];
  for (const row of data ?? []) {
    if (!row.grupo_id || !row.player_id) continue;
    let entry = byGrupo.get(row.grupo_id);
    if (!entry) {
      const hint = row.balance_hint;
      entry = {
        fecha: row.fecha,
        teamA: [],
        teamB: [],
        bench: [],
        balanceHint:
          hint === "parejos" || hint === "equipo_A_abajo" || hint === "equipo_B_abajo"
            ? hint
            : null,
      };
      byGrupo.set(row.grupo_id, entry);
    }
    const member: ConfirmedTeamMember = {
      playerId: row.player_id,
      nombre: row.nombre ?? "—",
      apodo: row.apodo,
      isGoalkeeper: row.is_goalkeeper,
      isMe: row.player_id === playerId,
      avatarUrl: null,
      clubId: null,
    };
    allMembers.push(member);
    // team_label NULL = banco (suplentes que no entraron como titulares).
    if (row.team_label === "A") entry.teamA.push(member);
    else if (row.team_label === "B") entry.teamB.push(member);
    else entry.bench.push(member);
  }

  // Fotos de los compañeros vía la vista publica (el RPC de equipos no las trae).
  // Mutamos los members ya pusheados a los equipos.
  const memberIds = Array.from(new Set(allMembers.map((m) => m.playerId)));
  if (memberIds.length > 0) {
    const { data: avatars } = await supabase
      .from("players_public")
      .select("id, avatar_url, club_id")
      .in("id", memberIds);
    const infoById = new Map<string, { avatarUrl: string | null; clubId: string | null }>();
    for (const a of avatars ?? []) {
      if (a.id) infoById.set(a.id, { avatarUrl: a.avatar_url ?? null, clubId: a.club_id ?? null });
    }
    for (const m of allMembers) {
      const info = infoById.get(m.playerId);
      m.avatarUrl = info?.avatarUrl ?? null;
      m.clubId = info?.clubId ?? null;
    }
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

  // El Prode del próximo partido confirmado, por grupo.
  const prodeByGrupo = await loadProde(supabase);

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
  // Para grupos SIN convocatoria abierta no mostramos un roster: solo el header
  // del grupo + estado vacio (ver fallback abajo). Antes mostrabamos el roster
  // del grupo y parecia una convocatoria fantasma.

  const playerById = new Map<
    string,
    { nombre: string; apodo: string | null; avatarUrl: string | null; clubId: string | null }
  >();
  const playerIdsList = Array.from(playerIds);
  if (playerIdsList.length > 0) {
    // Resolvemos los nombres del roster con una RPC (no con players_public), que
    // incluye a los invitados (is_guest) de las convocatorias en las que
    // participo. players_public los filtra y caían a "—".
    const { data: playersData } = await supabase.rpc("get_convocatoria_roster_names", {
      p_conv_ids: convIds,
    });
    for (const p of playersData ?? []) {
      if (p.player_id)
        playerById.set(p.player_id, {
          nombre: p.nombre ?? "—",
          apodo: p.apodo ?? null,
          avatarUrl: p.avatar_url ?? null,
          clubId: p.club_id ?? null,
        });
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
            ? { nombre: r.nombre_libre ?? "—", apodo: null, avatarUrl: null, clubId: null }
            : (playerById.get(r.player_id!) ?? {
                nombre: "—",
                apodo: null,
                avatarUrl: null,
                clubId: null,
              });
          return {
            playerId: r.player_id,
            rol: "titular" as const,
            orden: null,
            nombre: info.nombre,
            apodo: info.apodo,
            avatarUrl: info.avatarUrl,
            clubId: info.clubId,
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
            ? { nombre: r.nombre_libre ?? "—", apodo: null, avatarUrl: null, clubId: null }
            : (playerById.get(r.player_id!) ?? {
                nombre: "—",
                apodo: null,
                avatarUrl: null,
                clubId: null,
              });
          return {
            playerId: r.player_id,
            rol: "suplente" as const,
            orden: r.orden_suplente,
            nombre: info.nombre,
            apodo: info.apodo,
            avatarUrl: info.avatarUrl,
            clubId: info.clubId,
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
      // Sin convocatoria abierta: NO mostramos roster (parecia una convocatoria
      // fantasma). Solo el header del grupo + estado vacio. Si el jugador se
      // bajo del grupo, conserva el CTA "Volver al grupo".
      titulares = [];
      suplentes = [];
      miEstado = memStatus === "inactivo" ? "bajado_grupo" : "sin_convocatoria";
    }

    result.push({
      grupo,
      openConv,
      miEstado,
      miOrden,
      titulares,
      suplentes,
      confirmedTeams: confirmedByGrupo.get(grupoId) ?? null,
      prode: prodeByGrupo.get(grupoId) ?? null,
    });
  }

  result.sort((a, b) => {
    // Orden por el compromiso más próximo: el match confirmado (si lo hay)
    // pesa antes que la convocatoria abierta. Después, los que no tienen nada
    // próximo, por día_semana habitual.
    const aFecha = a.confirmedTeams?.fecha ?? a.openConv?.fecha ?? null;
    const bFecha = b.confirmedTeams?.fecha ?? b.openConv?.fecha ?? null;
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

  const supabase = await createClient();

  const { data: playerRows } = await supabase.rpc("get_my_player_summary");
  const player = playerRows && playerRows.length > 0 ? playerRows[0] : null;

  // El player siempre entra; admin/coordinador/veedor solo si tienen ficha de
  // jugador (ellos también juegan). Sin ficha → su home real.
  if (!player && ctx.profile.role !== "player") {
    redirect("/");
  }

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

      <div className="flex items-center gap-3">
        {player ? (
          <PlayerAvatar
            url={player.avatar_url}
            nombre={player.nombre}
            apodo={player.apodo}
            size="lg"
          />
        ) : null}
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900">
            {player?.club_id ? <ClubCrest clubId={player.club_id} size={22} /> : null}
            <span>
              Hola{player ? `, ${player.apodo?.trim() || player.nombre.split(" ")[0]}` : ""}.
            </span>
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            {player?.status === "approved"
              ? "Tu perfil está aprobado y podés ser convocado a los partidos."
              : "Tu perfil está pendiente de aprobación del organizador. Igual ya quedaste agregado a tus grupos."}
          </p>
        </div>
      </div>

      <NotificationsCard />

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
        lineups.map((l) =>
          l.confirmedTeams ? (
            <ConfirmedMatchCard key={l.grupo.id} lineup={l} teams={l.confirmedTeams} />
          ) : (
            <GrupoCard key={l.grupo.id} lineup={l} />
          ),
        )
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
  isUnderdog = false,
}: {
  label: string;
  members: ConfirmedTeamMember[];
  isUnderdog?: boolean;
}) {
  return (
    <div className="rounded bg-white p-2 ring-1 ring-emerald-100">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-xs font-semibold text-emerald-900">{label}</p>
        {isUnderdog ? (
          <span className="rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 ring-1 ring-orange-200">
            💪 ¡a darlo vuelta!
          </span>
        ) : null}
      </div>
      {members.length === 0 ? (
        <p className="mt-1 text-xs text-neutral-500">Sin jugadores.</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {members.map((m) => (
            <li
              key={m.playerId}
              className={`flex items-center gap-2 text-sm ${m.isMe ? "font-semibold text-emerald-900" : "text-neutral-800"}`}
            >
              <PlayerAvatar url={m.avatarUrl} nombre={m.nombre} apodo={m.apodo} />
              <ClubCrest clubId={m.clubId} size={16} />
              <span className="min-w-0 truncate">
                {m.isGoalkeeper ? (
                  <span className="mr-1" title="Arquero">
                    🧤
                  </span>
                ) : null}
                {playerLabel(m.nombre, m.apodo)}
                {m.isMe ? <span className="ml-1 text-xs text-emerald-700">· vos</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Card del partido con equipos ya confirmados: el roster completo de la
// convocatoria es redundante (los equipos ya dicen quién juega), así que solo
// mostramos los equipos + el banco (suplentes que no entraron). La próxima
// convocatoria de ESTE grupo queda oculta hasta que el partido pase; otros
// grupos del jugador se muestran de forma independiente.
function ConfirmedMatchCard({ lineup, teams }: { lineup: GrupoLineup; teams: ConfirmedTeams }) {
  const { grupo } = lineup;
  const hora = formatHora(grupo.hora);
  const lugar = grupo.lugar;

  const enEquipo = teams.teamA.some((m) => m.isMe) || teams.teamB.some((m) => m.isMe);
  const enBanco = teams.bench.some((m) => m.isMe);

  const miLabel = enEquipo ? "Jugás" : enBanco ? "En el banco" : "No estás en este partido";
  const miBadgeClass = enEquipo
    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
    : enBanco
      ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
      : "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";

  return (
    <section className="rounded-lg border border-emerald-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-neutral-900">{grupo.nombre}</h2>
          <p className="mt-1 text-sm font-medium text-emerald-800">
            Partido confirmado: {formatFecha(teams.fecha)} · {hora}
          </p>
          <p className="text-xs text-neutral-700">{lugar?.nombre ?? "Sin lugar definido"}</p>
          {lugar?.maps ? (
            <a
              href={lugar.maps}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-block text-xs text-neutral-700 underline transition hover:text-neutral-900"
            >
              Ver en Maps ↗
            </a>
          ) : null}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${miBadgeClass}`}>
          {miLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <ConfirmedTeamColumn
          label="Equipo A"
          members={teams.teamA}
          isUnderdog={teams.balanceHint === "equipo_A_abajo"}
        />
        <ConfirmedTeamColumn
          label="Equipo B"
          members={teams.teamB}
          isUnderdog={teams.balanceHint === "equipo_B_abajo"}
        />
      </div>

      {teams.balanceHint === "parejos" ? (
        <div className="mt-3 flex justify-center">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
            ⚖️ Equipos parejos
          </span>
        </div>
      ) : null}

      {teams.bench.length > 0 ? (
        <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Banco ({teams.bench.length})
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            Lista de espera: juegan solo si baja alguien.
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {teams.bench.map((m) => (
              <li
                key={m.playerId}
                className={`flex items-center gap-2 text-sm ${m.isMe ? "font-semibold text-amber-900" : "text-neutral-800"}`}
              >
                <PlayerAvatar url={m.avatarUrl} nombre={m.nombre} apodo={m.apodo} />
                <ClubCrest clubId={m.clubId} size={16} />
                <span className="truncate">
                  {playerLabel(m.nombre, m.apodo)}
                  {m.isMe ? <span className="ml-1 text-xs text-amber-700">· vos</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {lineup.prode ? <ProdeForm info={lineup.prode} /> : null}
    </section>
  );
}

function GrupoCard({ lineup }: { lineup: GrupoLineup }) {
  const { grupo, openConv, miEstado, miOrden, titulares, suplentes } = lineup;
  const dia = DIA_LABEL[grupo.dia_semana];
  const hora = formatHora(grupo.hora);

  const miLabel =
    miEstado === "titular_convo"
      ? "Sos titular"
      : miEstado === "suplente_convo"
        ? `En lista de espera (#${miOrden ?? "?"})`
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
        {miEstado === "sin_convocatoria" ? null : (
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${miBadgeClass}`}
          >
            {miLabel}
          </span>
        )}
      </div>

      {miEstado === "sin_convocatoria" ? (
        <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-xs text-neutral-600">
            Todavía no hay convocatoria abierta para este grupo. Cuando el organizador la abra, vas
            a aparecer acá.
          </p>
        </div>
      ) : null}

      {miEstado === "declinado_convo" && openConv ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-xs text-red-800">
            Avisaste que no vas a este partido. Si querés volver, entrás como titular si hay cupo o
            al final de la lista de espera.
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
            titular si hay cupo o al final de la lista de espera.
          </p>
          <div className="mt-2">
            <JoinConvocatoriaButton convocatoriaId={openConv.id} label="Me anoto" />
          </div>
        </div>
      ) : null}

      {miEstado === "bajado_grupo" ? (
        <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-xs text-neutral-600">
            Te bajaste de este grupo. Podés volver ahora: si hay cupo entrás como titular, si no al
            final de la lista de espera.
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
              ? "Si te bajás, el primero de la lista de espera sube a titular."
              : "Si te bajás, la cola se acomoda. Podés volver más tarde."}
          </p>
        </div>
      ) : null}

      {openConv ? (
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
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      {i + 1}
                    </span>
                    <PlayerAvatar url={m.avatarUrl} nombre={m.nombre} apodo={m.apodo} />
                    <ClubCrest clubId={m.clubId} size={16} />
                    <span className="min-w-0 truncate">
                      {playerLabel(m.nombre, m.apodo)}
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
              Lista de espera ({suplentes.length})
            </h3>
            {suplentes.length === 0 ? (
              <p className="mt-2 text-xs text-neutral-500">Lista de espera vacía.</p>
            ) : (
              <ol className="mt-2 space-y-1">
                {suplentes.map((m, i) => (
                  <li
                    key={m.playerId ?? `libre-${i}`}
                    className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${
                      m.isMe ? "bg-amber-50 font-semibold text-amber-900" : "text-neutral-800"
                    }`}
                  >
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-700">
                      {m.orden ?? "?"}
                    </span>
                    <PlayerAvatar url={m.avatarUrl} nombre={m.nombre} apodo={m.apodo} />
                    <ClubCrest clubId={m.clubId} size={16} />
                    <span className="min-w-0 truncate">
                      {playerLabel(m.nombre, m.apodo)}
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
      ) : null}
    </section>
  );
}
