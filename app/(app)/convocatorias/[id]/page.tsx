import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/require-role";
import { playerLabel } from "@/lib/players/label";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { ClubCrest } from "@/components/club-crest";
import { parseTeamDraft, type TeamDraft, type TeamLabel } from "@/lib/teams/draft";
import { countRegroup, effectivePhysical } from "@/lib/teams/generate";
import { loadGroupRatings } from "@/lib/teams/group-ratings";
import { findUnplayedPreviousConvocatoria } from "@/lib/convocatorias/previous-played-gate";
import { loadPreviousComposition } from "@/lib/teams/previous";

import { AddGuestForm } from "./add-guest-form";
import { AddPlayerForm } from "./add-player-form";
import { AwardAdminForm, type AwardOption } from "./award-admin-form";
import { CancelForm } from "./cancel-form";
import { ConfirmMatchForm } from "./confirm-match-form";
import { CupoEditor } from "./cupo-editor";
import { ClearDraftForm, GenerateDraftForm, PromoteToGKForm, SwapPlayerForm } from "./draft-forms";
import { FiguraForm, type FiguraOption } from "./figura-form";
import { GoalsForm, type GoalsFormTeam } from "./goals-form";
import { RemovePlayerForm } from "./remove-player-form";
import { ResultForm } from "./result-form";
import { ShareAnotadosButton } from "./share-anotados-button";
import { ShareTeamsButton } from "./share-teams-button";
import { VideoForm } from "./video-form";

type Status = Database["public"]["Enums"]["convocatoria_status"];
type RoleField = Database["public"]["Enums"]["player_role_field"];
type PositionPref = Database["public"]["Enums"]["position_pref"];

type SearchParams = { q?: string; rol?: string; pos?: string; confirmed?: string };

const STATUS_LABEL: Record<Status, string> = {
  abierta: "Abierta",
  cerrada: "Cerrada",
  jugada: "Jugada",
  cancelada: "Cancelada",
};

const STATUS_BADGE: Record<Status, string> = {
  abierta: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  cerrada: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  jugada: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  cancelada: "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200",
};

const ROLE_LABEL: Record<RoleField, string> = {
  arquero: "Arquero",
  jugador_campo: "Jugador de campo",
  mixto: "Mixto",
};

const POSITION_LABEL: Record<PositionPref, string> = {
  arquero: "Arquero",
  defensor: "Defensor",
  mediocampista: "Mediocampista",
  delantero: "Delantero",
};

const ROLES: readonly RoleField[] = ["arquero", "jugador_campo", "mixto"];
const POSITIONS: readonly PositionPref[] = ["arquero", "defensor", "mediocampista", "delantero"];

function parseRol(raw: string | undefined): RoleField | null {
  return (ROLES as readonly string[]).includes(raw ?? "") ? (raw as RoleField) : null;
}

function parsePos(raw: string | undefined): PositionPref | null {
  return (POSITIONS as readonly string[]).includes(raw ?? "") ? (raw as PositionPref) : null;
}

function buildSelectorHref(
  convocatoriaId: string,
  filters: { q?: string; rol?: RoleField | null; pos?: PositionPref | null },
): string {
  const qs = new URLSearchParams();
  if (filters.q) qs.set("q", filters.q);
  if (filters.rol) qs.set("rol", filters.rol);
  if (filters.pos) qs.set("pos", filters.pos);
  const s = qs.toString();
  return s ? `/convocatorias/${convocatoriaId}?${s}` : `/convocatorias/${convocatoriaId}`;
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatHora(raw: string): string {
  return raw.slice(0, 5);
}

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

async function loadMatch(supabase: SupabaseLike, convocatoriaId: string) {
  const { data, error } = await supabase
    .from("matches")
    .select(
      `id, score_team_a, score_team_b, winner, notas, confirmed_at, confirmed_with_warning,
       video_resumen_url, figura_player_id, carnicero_player_id, pinocho_player_id,
       reviewer:profiles!confirmed_by(nombre),
       teams:match_teams!match_id(
         id, team_label, total_score,
         players:match_team_players!match_team_id(
           id, is_goalkeeper, assigned_position,
           player:players!player_id(id, nombre, apodo, role_field, position_pref, internal_score, club_id)
         )
       )`,
    )
    .eq("convocatoria_id", convocatoriaId)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo cargar el partido: ${error.message}`);
  }
  return data;
}

export default async function ConvocatoriaDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requireRole(["admin", "veedor", "coordinador"]);
  const canManage = ctx.profile.role === "admin" || ctx.profile.role === "coordinador";
  const { id } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const { data: convocatoria, error } = await supabase
    .from("convocatorias")
    .select(
      `id, fecha, hora, status, cupo_maximo, notas, created_at, team_draft, grupo_id,
       lugar:lugares!lugar_id(id, nombre),
       grupo:grupos!grupo_id(nombre, premio_pinocho),
       creator:profiles!created_by(nombre)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo cargar la convocatoria: ${error.message}`);
  }
  if (!convocatoria) {
    notFound();
  }

  const { data: convocadosRaw, error: convError } = await supabase
    .from("convocatoria_players")
    .select(
      `id, added_at, attendance_status, nombre_libre, rol_en_convocatoria, orden_suplente,
       player:players!player_id(id, nombre, apodo, role_field, position_pref, status, internal_score, club_id,
         physical, mental, technical, edad)`,
    )
    .eq("convocatoria_id", id)
    .order("added_at", { ascending: true });

  if (convError) {
    throw new Error(`No se pudieron cargar los convocados: ${convError.message}`);
  }

  const convocados = convocadosRaw ?? [];
  const convocadoIds = new Set(convocados.map((cp) => cp.player?.id).filter(Boolean) as string[]);

  const isOpen = convocatoria.status === "abierta";
  const isClosed = convocatoria.status === "cerrada";
  const isPlayed = convocatoria.status === "jugada";
  const overCupo = convocados.length > convocatoria.cupo_maximo;

  // Match data: si la convocatoria ya fue confirmada (cerrada o jugada),
  // cargamos matches + match_teams + match_team_players para renderizar la
  // vista oficial del partido (no del draft).
  const match = isClosed || isPlayed ? await loadMatch(supabase, id) : null;

  // Stats de goles, asistencias y goles en contra por jugador (FUT-79 / FUT-98).
  // Solo si hay match.
  let goalsByPlayerId: Record<string, number> = {};
  let assistsByPlayerId: Record<string, number> = {};
  let ownGoalsByPlayerId: Record<string, number> = {};
  if (match) {
    const { data: statsRows, error: statsErr } = await supabase
      .from("match_player_stats")
      .select("player_id, goals, asistencias, own_goals")
      .eq("match_id", match.id);

    if (statsErr) {
      throw new Error(`No se pudieron cargar los goles: ${statsErr.message}`);
    }
    goalsByPlayerId = Object.fromEntries((statsRows ?? []).map((r) => [r.player_id, r.goals]));
    assistsByPlayerId = Object.fromEntries(
      (statsRows ?? []).map((r) => [r.player_id, r.asistencias]),
    );
    ownGoalsByPlayerId = Object.fromEntries(
      (statsRows ?? []).map((r) => [r.player_id, r.own_goals]),
    );
  }

  // Conteo de votos de la figura (FUT-99): SOLO admin. La RPC ya devuelve vacío
  // para no-admin, pero evitamos la llamada salvo que sea admin.
  let figuraVotes: { playerId: string; nombre: string; apodo: string | null; votos: number }[] = [];
  if (match && canManage) {
    const { data: votesData } = await supabase.rpc("get_figura_votes", { p_match_id: match.id });
    figuraVotes = (votesData ?? []).map((v) => ({
      playerId: v.voted_player_id,
      nombre: v.nombre,
      apodo: v.apodo,
      votos: Number(v.votos),
    }));
  }

  // Conteo de votos de los premios (FUT-102): SOLO admin, igual que la figura.
  // Pinocho solo si el grupo lo tiene habilitado.
  type AwardVoteRow = { playerId: string; nombre: string; apodo: string | null; votos: number };
  const premioPinochoOn = convocatoria.grupo?.premio_pinocho ?? false;
  let carniceroVotes: AwardVoteRow[] = [];
  let pinochoVotes: AwardVoteRow[] = [];
  if (match && canManage) {
    const { data: carniceroData } = await supabase.rpc("get_award_votes", {
      p_match_id: match.id,
      p_categoria: "carnicero",
    });
    carniceroVotes = (carniceroData ?? []).map((v) => ({
      playerId: v.voted_player_id,
      nombre: v.nombre,
      apodo: v.apodo,
      votos: Number(v.votos),
    }));
    if (premioPinochoOn) {
      const { data: pinochoData } = await supabase.rpc("get_award_votes", {
        p_match_id: match.id,
        p_categoria: "pinocho",
      });
      pinochoVotes = (pinochoData ?? []).map((v) => ({
        playerId: v.voted_player_id,
        nombre: v.nombre,
        apodo: v.apodo,
        votos: Number(v.votos),
      }));
    }
  }

  // Selector: admin puede editar el roster en abierta, cerrada y jugada.
  // En cerrada/jugada es "ultimo recurso" para registrar eventualidades
  // (faltazos, invitados que cubrieron, etc).
  const showSelector = canManage && (isOpen || isClosed || isPlayed);

  // Teams: admin + abierta + al menos 10 convocados (5v5 minimo segun
  // plan v4). El draft persistido vive en convocatorias.team_draft (PR 2).
  const MIN_CONVOCADOS_PARA_GENERAR = 10;
  const canGenerateTeams = canManage && isOpen && convocados.length >= MIN_CONVOCADOS_PARA_GENERAR;

  const teamDraft = parseTeamDraft(convocatoria.team_draft);

  // Regla de secuencia: si hay una convocatoria anterior del mismo grupo sin
  // jugar, no se puede cerrar esta (el admin debe cargar antes el resultado del
  // partido viejo). Solo importa cuando el admin podría confirmar.
  const unplayedPrevious =
    canManage && isOpen ? await findUnplayedPreviousConvocatoria(supabase, convocatoria.id) : null;

  // FUT-88: señal de variedad vs la fecha anterior, recalculada en vivo desde
  // el draft actual (refleja también los swaps manuales del admin).
  let varietyInfo: VarietyInfo | null = null;
  if (teamDraft) {
    const previous = await loadPreviousComposition(supabase, convocatoria.id);
    if (!previous) {
      varietyInfo = { kind: "no_previous" };
    } else {
      const aIds = [teamDraft.A.goalkeeperPlayerId, ...teamDraft.A.playerIds].filter(
        (x): x is string => x !== null,
      );
      const bIds = [teamDraft.B.goalkeeperPlayerId, ...teamDraft.B.playerIds].filter(
        (x): x is string => x !== null,
      );
      const { changes, returningPlayers } = countRegroup(aIds, bIds, previous);
      if (returningPlayers < 2) varietyInfo = { kind: "few_returning" };
      else if (changes >= 2) varietyInfo = { kind: "ok", changes, returningPlayers };
      else varietyInfo = { kind: "repeated", changes, returningPlayers };
    }
  }

  // Mapa playerId -> info para renderizar el draft con scores.
  type PlayerInfo = {
    id: string;
    nombre: string;
    apodo: string | null;
    role_field: RoleField;
    position_pref: PositionPref;
    internal_score: number;
    club_id: string | null;
    physical: number | null;
    mental: number | null;
    technical: number | null;
    edad: number | null;
  };
  // FUT-103/105: el balance que se muestra usa el rating POR GRUPO (mismo
  // override que la generación y el snapshot), así lo que se ve coincide con lo
  // que se arma. La edad/club/apodo siguen de players (globales).
  const groupRatingOverrides = await loadGroupRatings(
    supabase,
    convocatoria.grupo_id,
    convocados.map((cp) => cp.player?.id).filter((id): id is string => Boolean(id)),
  );

  const playerInfoById = new Map<string, PlayerInfo>();
  for (const cp of convocados) {
    const p = cp.player;
    if (p && p.internal_score !== null) {
      const g = groupRatingOverrides.get(p.id);
      playerInfoById.set(p.id, {
        id: p.id,
        nombre: p.nombre,
        apodo: p.apodo,
        role_field: g?.role_field ?? p.role_field,
        position_pref: g?.position_pref ?? p.position_pref,
        internal_score: g ? g.internal_score : Number(p.internal_score),
        club_id: p.club_id,
        physical: g?.physical ?? p.physical,
        mental: g?.mental ?? p.mental,
        technical: g?.technical ?? p.technical,
        edad: p.edad,
      });
    }
  }

  const q = (sp.q ?? "").trim();
  const rol = parseRol(sp.rol);
  const pos = parsePos(sp.pos);

  let availablePlayers: Array<{
    id: string;
    nombre: string;
    apodo: string | null;
    role_field: RoleField;
    position_pref: PositionPref;
  }> = [];

  if (showSelector) {
    let q2 = supabase
      .from("players")
      .select("id, nombre, apodo, role_field, position_pref")
      .eq("status", "approved")
      .order("nombre", { ascending: true })
      .limit(50);

    if (q.length > 0) q2 = q2.ilike("nombre", `%${q}%`);
    if (rol) q2 = q2.eq("role_field", rol);
    if (pos) q2 = q2.eq("position_pref", pos);

    const { data, error: playersError } = await q2;
    if (playersError) {
      throw new Error(`No se pudieron cargar los jugadores: ${playersError.message}`);
    }
    availablePlayers = (data ?? []).filter((p) => !convocadoIds.has(p.id));
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/convocatorias"
          className="text-sm text-neutral-500 transition hover:text-neutral-700"
        >
          ← Volver al listado
        </Link>
      </div>

      {sp.confirmed === "1" ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Match confirmado. La convocatoria pasó a estado cerrada y se creó el partido.
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            {convocatoria.grupo?.nombre ?? "Convocatoria"}
          </h1>
          <p className="mt-1 text-sm font-medium text-neutral-800">
            {formatDate(convocatoria.fecha)} · {formatHora(convocatoria.hora)}
          </p>
          <p className="text-sm text-neutral-600">
            {convocatoria.lugar?.nombre ?? "Lugar sin definir"} · cupo {convocatoria.cupo_maximo}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[convocatoria.status]}`}
        >
          {STATUS_LABEL[convocatoria.status]}
        </span>
      </div>

      {convocatoria.notas ? (
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Notas</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-neutral-700">{convocatoria.notas}</p>
        </section>
      ) : null}

      {canManage && isOpen ? (
        <CupoEditor convocatoriaId={convocatoria.id} cupoActual={convocatoria.cupo_maximo} />
      ) : null}

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Convocados
          </h2>
          <p className={`text-sm font-medium ${overCupo ? "text-amber-700" : "text-neutral-700"}`}>
            {convocados.length} de {convocatoria.cupo_maximo}
            {overCupo ? " · supera el cupo" : ""}
          </p>
        </div>

        {convocados.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Sin convocados todavía.</p>
        ) : (
          <ConvocadosLista
            convocados={convocados}
            cupoMaximo={convocatoria.cupo_maximo}
            convocatoriaId={convocatoria.id}
            mostrarSacar={showSelector}
          />
        )}

        {canManage && isOpen ? (
          <div className="mt-4 border-t border-neutral-200 pt-4">
            <ShareAnotadosButton convocatoriaId={convocatoria.id} />
            <p className="mt-1 text-xs text-neutral-500">
              Compartí la lista por WhatsApp para que se cubran los lugares libres.
            </p>
          </div>
        ) : null}
      </section>

      {showSelector ? (
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Agregar jugadores
          </h2>
          <form method="get" className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label htmlFor="q" className="block text-xs font-medium text-neutral-700">
                Buscar por nombre
              </label>
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Ej: Juan"
                className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>
            <div>
              <label htmlFor="rol" className="block text-xs font-medium text-neutral-700">
                Rol
              </label>
              <select
                id="rol"
                name="rol"
                defaultValue={rol ?? ""}
                className="mt-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              >
                <option value="">Todos</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pos" className="block text-xs font-medium text-neutral-700">
                Posición
              </label>
              <select
                id="pos"
                name="pos"
                defaultValue={pos ?? ""}
                className="mt-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              >
                <option value="">Todas</option>
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {POSITION_LABEL[p]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50"
            >
              Filtrar
            </button>
            {(q || rol || pos) && (
              <Link
                href={buildSelectorHref(convocatoria.id, {})}
                className="text-xs font-medium text-neutral-500 underline transition hover:text-neutral-700"
              >
                Limpiar
              </Link>
            )}
          </form>

          {availablePlayers.length === 0 ? (
            <p className="mt-4 text-sm text-neutral-500">
              {q || rol || pos
                ? "Ningún jugador approved coincide con el filtro."
                : "No hay jugadores approved disponibles para convocar."}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-neutral-100">
              {availablePlayers.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900">
                      {playerLabel(p.nombre, p.apodo)}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {ROLE_LABEL[p.role_field]} · {POSITION_LABEL[p.position_pref]}
                    </p>
                  </div>
                  <AddPlayerForm convocatoriaId={convocatoria.id} playerId={p.id} />
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 border-t border-neutral-200 pt-4">
            <p className="text-xs text-neutral-500">
              Para emergencias (alguien que no está en el catálogo y vino a cubrir un faltazo):
            </p>
            <div className="mt-2">
              <AddGuestForm convocatoriaId={convocatoria.id} />
            </div>
          </div>
        </section>
      ) : null}

      {match ? (
        <MatchSection
          match={match}
          convocatoriaId={convocatoria.id}
          canManage={canManage}
          isPlayed={isPlayed}
          goalsByPlayerId={goalsByPlayerId}
          assistsByPlayerId={assistsByPlayerId}
          ownGoalsByPlayerId={ownGoalsByPlayerId}
          figuraVotes={figuraVotes}
          carniceroVotes={carniceroVotes}
          pinochoVotes={pinochoVotes}
          premioPinochoOn={premioPinochoOn}
        />
      ) : null}

      {!match && (canGenerateTeams || teamDraft) ? (
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Teams
            </h2>
            {teamDraft ? <DraftSummary draft={teamDraft} playerInfoById={playerInfoById} /> : null}
          </div>

          {canGenerateTeams ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <GenerateDraftForm convocatoriaId={convocatoria.id} hasDraft={!!teamDraft} />
              {teamDraft ? <ClearDraftForm convocatoriaId={convocatoria.id} /> : null}
            </div>
          ) : null}

          {teamDraft && varietyInfo ? <VarietyBanner info={varietyInfo} /> : null}

          {teamDraft ? <RubrosBalance draft={teamDraft} infoById={playerInfoById} /> : null}

          {teamDraft ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <DraftTeamColumn
                label="A"
                side={teamDraft.A}
                playerInfoById={playerInfoById}
                convocatoriaId={convocatoria.id}
                editable={canManage && isOpen}
              />
              <DraftTeamColumn
                label="B"
                side={teamDraft.B}
                playerInfoById={playerInfoById}
                convocatoriaId={convocatoria.id}
                editable={canManage && isOpen}
              />
            </div>
          ) : canManage && isOpen ? (
            <p className="mt-3 text-sm text-neutral-500">
              Hacé click en &ldquo;Generar teams&rdquo; para armar el draft. Después vas a poder
              mover jugadores entre A y B.
            </p>
          ) : null}

          {teamDraft && canManage && isOpen ? (
            <div className="mt-5 border-t border-neutral-200 pt-5">
              <h3 className="text-sm font-semibold text-neutral-900">Confirmar match</h3>
              <p className="mt-1 text-xs text-neutral-500">
                Una vez confirmado, la convocatoria pasa a <code>cerrada</code>, se crea el partido
                con su snapshot inmutable y no se pueden editar más los teams.
              </p>
              <div className="mt-3">
                <ConfirmMatchForm
                  convocatoriaId={convocatoria.id}
                  unplayedPreviousFecha={
                    unplayedPrevious ? formatDate(unplayedPrevious.fecha) : null
                  }
                />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {canManage && isOpen && !canGenerateTeams ? (
        <section className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-5 text-sm text-neutral-600">
          Para generar el draft de teams hacen falta al menos {MIN_CONVOCADOS_PARA_GENERAR}{" "}
          convocados. Llevás {convocados.length}.
        </section>
      ) : null}

      {canManage && isOpen ? (
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Cancelar convocatoria
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            La cancelación deja la convocatoria archivada con todos sus convocados, pero no se podrá
            editar más.
          </p>
          <div className="mt-3">
            <CancelForm convocatoriaId={convocatoria.id} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

type MatchData = NonNullable<Awaited<ReturnType<typeof loadMatch>>>;

const WINNER_LABEL: Record<NonNullable<MatchData["winner"]>, string> = {
  a: "Ganó Team A",
  b: "Ganó Team B",
  empate: "Empate",
};

function MatchSection({
  match,
  convocatoriaId,
  canManage,
  isPlayed,
  goalsByPlayerId,
  assistsByPlayerId,
  ownGoalsByPlayerId,
  figuraVotes,
  carniceroVotes,
  pinochoVotes,
  premioPinochoOn,
}: {
  match: MatchData;
  convocatoriaId: string;
  canManage: boolean;
  isPlayed: boolean;
  goalsByPlayerId: Record<string, number>;
  assistsByPlayerId: Record<string, number>;
  ownGoalsByPlayerId: Record<string, number>;
  figuraVotes: { playerId: string; nombre: string; apodo: string | null; votos: number }[];
  carniceroVotes: { playerId: string; nombre: string; apodo: string | null; votos: number }[];
  pinochoVotes: { playerId: string; nombre: string; apodo: string | null; votos: number }[];
  premioPinochoOn: boolean;
}) {
  const hasResult = match.score_team_a !== null && match.score_team_b !== null;
  const teams = [...(match.teams ?? [])].sort((a, b) => a.team_label.localeCompare(b.team_label));

  const goalsFormTeams: GoalsFormTeam[] = teams.map((t) => ({
    label: t.team_label,
    score: t.team_label === "A" ? match.score_team_a : match.score_team_b,
    players: (t.players ?? []).flatMap((mtp) => {
      const p = mtp.player;
      if (!p) return [];
      return [
        { playerId: p.id, nombre: p.nombre, apodo: p.apodo, isGoalkeeper: mtp.is_goalkeeper },
      ];
    }),
  }));

  // Figura del partido (FUT-77): jugadores que jugaron, para el selector del
  // admin y para mostrar quién es la figura actual.
  const figuraOptions: FiguraOption[] = goalsFormTeams.flatMap((t) =>
    t.players.map((p) => ({ playerId: p.playerId, nombre: p.nombre, apodo: p.apodo })),
  );
  // Figura resuelta = override del admin ?? más votado (líder único). El líder
  // se calcula del conteo (solo lo tiene el admin); el veedor cae al override.
  const [topVote, secondVote] = figuraVotes;
  const figuraLeaderId =
    topVote && (!secondVote || topVote.votos > secondVote.votos) ? topVote.playerId : null;
  const resolvedFiguraId = match.figura_player_id ?? figuraLeaderId;
  const figura = resolvedFiguraId
    ? (figuraOptions.find((p) => p.playerId === resolvedFiguraId) ?? null)
    : null;

  // Premios votados (FUT-102): mismo cálculo que la figura — override del admin
  // ?? líder único del conteo. El veedor (sin conteo) cae al override.
  const awardOptions: AwardOption[] = figuraOptions;
  const resolveAward = (
    overrideId: string | null,
    votes: { playerId: string; votos: number }[],
  ): AwardOption | null => {
    const [t, s] = votes;
    const leaderId = t && (!s || t.votos > s.votos) ? t.playerId : null;
    const id = overrideId ?? leaderId;
    return id ? (awardOptions.find((p) => p.playerId === id) ?? null) : null;
  };
  const carnicero = resolveAward(match.carnicero_player_id, carniceroVotes);
  const pinocho = premioPinochoOn ? resolveAward(match.pinocho_player_id, pinochoVotes) : null;

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Partido</h2>
        {hasResult && match.winner ? (
          <p className="text-sm font-semibold text-emerald-700">
            {WINNER_LABEL[match.winner]} · {match.score_team_a} a {match.score_team_b}
          </p>
        ) : (
          <p className="text-xs text-neutral-500">Sin resultado cargado todavía</p>
        )}
      </div>

      {canManage ? (
        <div className="mt-3">
          <ShareTeamsButton convocatoriaId={convocatoriaId} />
        </div>
      ) : null}

      {match.confirmed_with_warning ? (
        <p className="mt-2 text-xs text-amber-700">
          Confirmado con avisos (ver balance_snapshot del partido).
        </p>
      ) : null}

      {figura ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            ⭐ Figura del partido
          </p>
          <p className="mt-1 text-sm font-semibold text-amber-900">
            {playerLabel(figura.nombre, figura.apodo)}
          </p>
        </div>
      ) : null}

      {carnicero ? (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
            🔪 El Carnicero
          </p>
          <p className="mt-1 text-sm font-semibold text-rose-900">
            {playerLabel(carnicero.nombre, carnicero.apodo)}
          </p>
        </div>
      ) : null}

      {pinocho ? (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            🪵 El Pinocho
          </p>
          <p className="mt-1 text-sm font-semibold text-amber-900">
            {playerLabel(pinocho.nombre, pinocho.apodo)}
          </p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {teams.map((t) => (
          <MatchTeamColumn key={t.id} team={t} />
        ))}
      </div>

      {match.notas ? (
        <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Notas</p>
          <p className="mt-1 whitespace-pre-line text-sm text-neutral-700">{match.notas}</p>
        </div>
      ) : null}

      {match.video_resumen_url ? (
        <div className="mt-4">
          <a
            href={match.video_resumen_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-50"
          >
            🎥 Ver video del partido
          </a>
        </div>
      ) : null}

      {canManage ? (
        <div className="mt-5 border-t border-neutral-200 pt-5">
          <h3 className="text-sm font-semibold text-neutral-900">
            {hasResult ? "Editar resultado" : "Cargar resultado"}
          </h3>
          {!hasResult ? (
            <p className="mt-1 text-xs text-neutral-500">
              Al guardar la primera vez, la convocatoria pasa a <code>jugada</code>.
            </p>
          ) : (
            <p className="mt-1 text-xs text-neutral-500">
              Podés editar el resultado mientras la convocatoria esté en <code>jugada</code>.
            </p>
          )}
          <div className="mt-3">
            <ResultForm
              convocatoriaId={convocatoriaId}
              initialScoreA={match.score_team_a}
              initialScoreB={match.score_team_b}
              initialNotas={match.notas}
              hasResult={hasResult}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-5 border-t border-neutral-200 pt-5">
        <h3 className="text-sm font-semibold text-neutral-900">Goles y asistencias por jugador</h3>
        {canManage ? (
          <>
            <p className="mt-1 text-xs text-neutral-500">
              {isPlayed
                ? "La suma de goles por team debería coincidir con el resultado. La asistencia es el pase que termina en gol."
                : "Podés precargar goles y asistencias ahora; el resultado se carga más arriba."}
            </p>
            <div className="mt-3">
              <GoalsForm
                convocatoriaId={convocatoriaId}
                teams={goalsFormTeams}
                initialGoalsByPlayerId={goalsByPlayerId}
                initialAssistsByPlayerId={assistsByPlayerId}
                initialOwnGoalsByPlayerId={ownGoalsByPlayerId}
              />
            </div>
          </>
        ) : (
          <GoalsReadOnly
            teams={goalsFormTeams}
            goalsByPlayerId={goalsByPlayerId}
            assistsByPlayerId={assistsByPlayerId}
            ownGoalsByPlayerId={ownGoalsByPlayerId}
          />
        )}
      </div>

      {canManage ? (
        <div className="mt-5 border-t border-neutral-200 pt-5">
          <h3 className="text-sm font-semibold text-neutral-900">Figura del partido</h3>
          <p className="mt-1 text-xs text-neutral-500">
            La votan los que jugaron (desde su historial). Gana el más votado; vos desempatás o la
            cambiás acá. Puede quedar sin figura.
          </p>
          <div className="mt-3">
            <FiguraForm
              convocatoriaId={convocatoriaId}
              players={figuraOptions}
              initialFiguraId={match.figura_player_id}
              votes={figuraVotes}
            />
          </div>
        </div>
      ) : null}

      {canManage ? (
        <div className="mt-5 border-t border-neutral-200 pt-5">
          <h3 className="text-sm font-semibold text-neutral-900">🔪 El Carnicero (el más rudo)</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Lo votan los que jugaron (desde su historial). Gana el más votado; vos desempatás o lo
            cambiás acá. Puede quedar sin asignar.
          </p>
          <div className="mt-3">
            <AwardAdminForm
              convocatoriaId={convocatoriaId}
              categoria="carnicero"
              nombrePremio="el Carnicero"
              players={awardOptions}
              initialPlayerId={match.carnicero_player_id}
              votes={carniceroVotes}
            />
          </div>
        </div>
      ) : null}

      {canManage && premioPinochoOn ? (
        <div className="mt-5 border-t border-neutral-200 pt-5">
          <h3 className="text-sm font-semibold text-neutral-900">🪵 El Pinocho (el peor)</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Premio opt-in del grupo. Lo votan los que jugaron; vos desempatás o lo cambiás acá.
            Puede quedar sin asignar.
          </p>
          <div className="mt-3">
            <AwardAdminForm
              convocatoriaId={convocatoriaId}
              categoria="pinocho"
              nombrePremio="el Pinocho"
              players={awardOptions}
              initialPlayerId={match.pinocho_player_id}
              votes={pinochoVotes}
            />
          </div>
        </div>
      ) : null}

      {canManage ? (
        <div className="mt-5 border-t border-neutral-200 pt-5">
          <h3 className="text-sm font-semibold text-neutral-900">Video del partido</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Pegá el link del resumen (SportsReel, YouTube, Drive). El jugador lo va a ver en su
            historial.
          </p>
          <div className="mt-3">
            <VideoForm convocatoriaId={convocatoriaId} initialUrl={match.video_resumen_url} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function GoalsReadOnly({
  teams,
  goalsByPlayerId,
  assistsByPlayerId,
  ownGoalsByPlayerId,
}: {
  teams: GoalsFormTeam[];
  goalsByPlayerId: Record<string, number>;
  assistsByPlayerId: Record<string, number>;
  ownGoalsByPlayerId: Record<string, number>;
}) {
  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-2">
      {teams.map((team) => {
        // Marcador efectivo = goles a favor + autogoles del rival (suman acá).
        const goalsFor = team.players.reduce(
          (acc, p) => acc + (goalsByPlayerId[p.playerId] ?? 0),
          0,
        );
        const rival = teams.find((t) => t.label !== team.label);
        const rivalOwnGoals = (rival?.players ?? []).reduce(
          (acc, p) => acc + (ownGoalsByPlayerId[p.playerId] ?? 0),
          0,
        );
        const sum = goalsFor + rivalOwnGoals;
        const mismatch = team.score !== null && sum !== team.score;
        return (
          <div key={team.label} className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold text-neutral-900">Team {team.label}</h4>
              <p className={`text-xs ${mismatch ? "text-amber-700" : "text-neutral-500"}`}>
                Goles: {sum}
                {team.score !== null ? ` / ${team.score}` : ""}
              </p>
            </div>
            {mismatch ? (
              <p className="mt-2 text-xs text-amber-700">
                La suma de goles no coincide con el resultado ({team.score}).
              </p>
            ) : null}
            <ul className="mt-3 space-y-1.5 text-sm">
              {team.players.map((p) => {
                const g = goalsByPlayerId[p.playerId] ?? 0;
                const a = assistsByPlayerId[p.playerId] ?? 0;
                const oself = ownGoalsByPlayerId[p.playerId] ?? 0;
                return (
                  <li key={p.playerId} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {p.isGoalkeeper ? (
                        <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
                          GK
                        </span>
                      ) : null}
                      <span className="truncate text-neutral-900">
                        {playerLabel(p.nombre, p.apodo)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-neutral-700">
                      {g} ⚽ · {a} 🅰️{oself > 0 ? ` · ${oself} 🙈` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function MatchTeamColumn({ team }: { team: MatchData["teams"][number] }) {
  const players = team.players ?? [];
  const sorted = [...players].sort((a, b) => {
    if (a.is_goalkeeper !== b.is_goalkeeper) return a.is_goalkeeper ? -1 : 1;
    const sa = a.player?.internal_score ?? 0;
    const sb = b.player?.internal_score ?? 0;
    return sb - sa;
  });

  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-neutral-900">Team {team.team_label}</h3>
        <p className="text-xs text-neutral-500">
          {players.length} jug. · score{" "}
          {team.total_score !== null ? Number(team.total_score).toFixed(2) : "—"}
        </p>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {sorted.map((mtp) => {
          const p = mtp.player;
          if (!p) return null;
          return (
            <li key={mtp.id} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                {mtp.is_goalkeeper ? (
                  <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
                    GK
                  </span>
                ) : null}
                <ClubCrest clubId={p.club_id} size={16} />
                <span className="truncate text-neutral-900">{playerLabel(p.nombre, p.apodo)}</span>
              </span>
              <span className="shrink-0 text-xs text-neutral-500">
                {Number(p.internal_score ?? 0).toFixed(2)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type PlayerInfoMap = Map<
  string,
  {
    id: string;
    nombre: string;
    apodo: string | null;
    role_field: RoleField;
    position_pref: PositionPref;
    internal_score: number;
    club_id: string | null;
    physical: number | null;
    mental: number | null;
    technical: number | null;
    edad: number | null;
  }
>;

function sumScores(playerIds: string[], gk: string | null, infoById: PlayerInfoMap): number {
  let total = 0;
  if (gk) total += infoById.get(gk)?.internal_score ?? 0;
  for (const id of playerIds) total += infoById.get(id)?.internal_score ?? 0;
  return total;
}

// FUT-95: totales por rubro de un lado del draft (físico efectivo + mental +
// técnica). El físico usa el factor de edad, igual que el score interno.
function sumRubros(
  side: TeamDraft["A"],
  infoById: PlayerInfoMap,
): { physEff: number; mental: number; technical: number } {
  const ids = side.goalkeeperPlayerId
    ? [side.goalkeeperPlayerId, ...side.playerIds]
    : side.playerIds;
  const acc = { physEff: 0, mental: 0, technical: 0 };
  for (const id of ids) {
    const p = infoById.get(id);
    if (!p) continue;
    const phys = p.physical ?? p.internal_score;
    acc.physEff += effectivePhysical(phys, p.edad);
    acc.mental += p.mental ?? p.internal_score;
    acc.technical += p.technical ?? p.internal_score;
  }
  return acc;
}

// FUT-95: muestra el balance rubro por rubro entre A y B. Marca en ámbar el
// rubro cuya diferencia sea relativamente alta (>10% del promedio del rubro).
function RubrosBalance({ draft, infoById }: { draft: TeamDraft; infoById: PlayerInfoMap }) {
  const a = sumRubros(draft.A, infoById);
  const b = sumRubros(draft.B, infoById);

  const rows: Array<{ label: string; va: number; vb: number }> = [
    { label: "Físico", va: a.physEff, vb: b.physEff },
    { label: "Mental", va: a.mental, vb: b.mental },
    { label: "Técnica", va: a.technical, vb: b.technical },
  ];

  return (
    <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Balance por rubro (A vs B)
      </p>
      <ul className="mt-1.5 space-y-1 text-xs">
        {rows.map((r) => {
          const avg = (r.va + r.vb) / 2;
          const diff = Math.abs(r.va - r.vb);
          const lopsided = avg > 0 && diff / avg > 0.1;
          return (
            <li key={r.label} className="flex items-center justify-between gap-3">
              <span className="text-neutral-600">{r.label}</span>
              <span
                className={
                  lopsided ? "font-semibold text-amber-700" : "tabular-nums text-neutral-700"
                }
              >
                {r.va.toFixed(1)} <span className="text-neutral-400">/</span> {r.vb.toFixed(1)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// FUT-88: estado de la señal de variedad mostrada al admin.
type VarietyInfo =
  | { kind: "no_previous" }
  | { kind: "few_returning" }
  | { kind: "ok"; changes: number; returningPlayers: number }
  | { kind: "repeated"; changes: number; returningPlayers: number };

function VarietyBanner({ info }: { info: VarietyInfo }) {
  const base = "mt-4 rounded-md border px-3 py-2 text-xs";
  if (info.kind === "no_previous") {
    return (
      <div className={`${base} border-neutral-200 bg-neutral-50 text-neutral-600`}>
        Primera fecha del grupo: no hay equipos previos para comparar variedad.
      </div>
    );
  }
  if (info.kind === "few_returning") {
    return (
      <div className={`${base} border-neutral-200 bg-neutral-50 text-neutral-600`}>
        Pocos jugadores repetidos respecto de la fecha anterior para evaluar la variedad.
      </div>
    );
  }
  if (info.kind === "ok") {
    return (
      <div className={`${base} border-emerald-200 bg-emerald-50 text-emerald-800`}>
        Variedad OK: cambian <strong>{info.changes}</strong> de {info.returningPlayers} jugadores
        repetidos respecto de la fecha anterior.
      </div>
    );
  }
  return (
    <div className={`${base} border-amber-200 bg-amber-50 text-amber-900`}>
      Se repiten casi los mismos equipos: {info.changes === 0 ? "ningún" : `solo ${info.changes}`}{" "}
      cambio respecto de la fecha anterior. Movés jugadores entre A y B para variar, o regenerás.
    </div>
  );
}

function DraftSummary({
  draft,
  playerInfoById,
}: {
  draft: TeamDraft;
  playerInfoById: PlayerInfoMap;
}) {
  const scoreA = sumScores(draft.A.playerIds, draft.A.goalkeeperPlayerId, playerInfoById);
  const scoreB = sumScores(draft.B.playerIds, draft.B.goalkeeperPlayerId, playerInfoById);
  const diff = Math.abs(scoreA - scoreB);

  return (
    <p className="text-xs text-neutral-500">
      Diferencia de score{" "}
      <span className={diff > 2 ? "font-semibold text-amber-700" : "text-neutral-700"}>
        {diff.toFixed(2)}
      </span>
    </p>
  );
}

function DraftTeamColumn({
  label,
  side,
  playerInfoById,
  convocatoriaId,
  editable,
}: {
  label: TeamLabel;
  side: TeamDraft["A"];
  playerInfoById: PlayerInfoMap;
  convocatoriaId: string;
  editable: boolean;
}) {
  const otherLabel: TeamLabel = label === "A" ? "B" : "A";
  const teamCount = side.playerIds.length + (side.goalkeeperPlayerId ? 1 : 0);
  const totalScore = sumScores(side.playerIds, side.goalkeeperPlayerId, playerInfoById);

  const positionDist: Record<PositionPref, number> = {
    arquero: 0,
    defensor: 0,
    mediocampista: 0,
    delantero: 0,
  };
  for (const id of side.playerIds) {
    const p = playerInfoById.get(id);
    if (p) positionDist[p.position_pref]++;
  }

  const gkInfo = side.goalkeeperPlayerId ? playerInfoById.get(side.goalkeeperPlayerId) : null;

  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-neutral-900">Team {label}</h3>
        <p className="text-xs text-neutral-500">
          {teamCount} jug. · score {totalScore.toFixed(2)}
        </p>
      </div>

      <ul className="mt-3 space-y-1.5 text-sm">
        {gkInfo ? (
          <li className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
                GK
              </span>
              <ClubCrest clubId={gkInfo.club_id} size={16} />
              <span className="truncate text-neutral-900">
                {playerLabel(gkInfo.nombre, gkInfo.apodo)}
              </span>
              <span className="shrink-0 text-xs text-neutral-500">
                {gkInfo.internal_score.toFixed(2)}
              </span>
            </span>
            {editable ? (
              <SwapPlayerForm
                convocatoriaId={convocatoriaId}
                playerId={gkInfo.id}
                targetLabel={`Team ${otherLabel}`}
              />
            ) : null}
          </li>
        ) : (
          <li className="text-xs italic text-amber-700">Sin arquero asignado</li>
        )}
        {side.playerIds.map((id) => {
          const p = playerInfoById.get(id);
          if (!p) return null;
          return (
            <li key={id} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <ClubCrest clubId={p.club_id} size={16} />
                <span className="truncate text-neutral-900">{playerLabel(p.nombre, p.apodo)}</span>
                <span className="shrink-0 text-xs text-neutral-500">
                  {p.internal_score.toFixed(2)}
                </span>
              </span>
              {editable ? (
                <span className="flex shrink-0 items-center gap-1">
                  <PromoteToGKForm convocatoriaId={convocatoriaId} playerId={id} />
                  <SwapPlayerForm
                    convocatoriaId={convocatoriaId}
                    playerId={id}
                    targetLabel={`Team ${otherLabel}`}
                  />
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 border-t border-neutral-200 pt-2 text-xs text-neutral-600">
        ARQ {positionDist.arquero} · DEF {positionDist.defensor} · MED {positionDist.mediocampista}{" "}
        · DEL {positionDist.delantero}
      </p>
    </div>
  );
}

type ConvocadoRow = {
  id: string;
  attendance_status: string;
  nombre_libre: string | null;
  rol_en_convocatoria: "titular" | "suplente";
  orden_suplente: number | null;
  player: {
    id: string;
    nombre: string;
    apodo: string | null;
    role_field: RoleField;
    position_pref: PositionPref;
  } | null;
};

function nombreDe(cp: ConvocadoRow): string {
  if (cp.player) return playerLabel(cp.player.nombre, cp.player.apodo);
  return cp.nombre_libre ?? "—";
}

function subtituloDe(cp: ConvocadoRow): string {
  if (cp.player) {
    return `${ROLE_LABEL[cp.player.role_field]} · ${POSITION_LABEL[cp.player.position_pref]}`;
  }
  return "Invitado libre";
}

function ConvocadosLista({
  convocados,
  cupoMaximo,
  convocatoriaId,
  mostrarSacar,
}: {
  convocados: ConvocadoRow[];
  cupoMaximo: number;
  convocatoriaId: string;
  mostrarSacar: boolean;
}) {
  const titulares = convocados
    .filter((cp) => cp.rol_en_convocatoria === "titular" && cp.attendance_status !== "declinado")
    .sort((a, b) => nombreDe(a).localeCompare(nombreDe(b), "es"));
  const suplentes = convocados
    .filter((cp) => cp.rol_en_convocatoria === "suplente" && cp.attendance_status !== "declinado")
    .sort((a, b) => (a.orden_suplente ?? 0) - (b.orden_suplente ?? 0));
  const declinados = convocados.filter((cp) => cp.attendance_status === "declinado");

  return (
    <div className="mt-3 space-y-5">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Titulares ({titulares.length}/{cupoMaximo})
        </h3>
        {titulares.length === 0 ? (
          <p className="mt-2 text-xs text-neutral-500">Sin titulares.</p>
        ) : (
          <ol className="mt-2 divide-y divide-neutral-100">
            {titulares.map((cp, i) => (
              <li key={cp.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-3">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-neutral-900">
                      {nombreDe(cp)}
                      {cp.player === null ? (
                        <span className="ml-2 text-xs font-normal text-neutral-500">
                          (invitado)
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-xs text-neutral-500">{subtituloDe(cp)}</span>
                  </span>
                </span>
                {mostrarSacar ? (
                  <RemovePlayerForm convocatoriaId={convocatoriaId} convocatoriaPlayerId={cp.id} />
                ) : null}
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
          <ol className="mt-2 divide-y divide-neutral-100">
            {suplentes.map((cp) => (
              <li key={cp.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-3">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-50 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                    {cp.orden_suplente ?? "?"}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-neutral-900">
                      {nombreDe(cp)}
                      {cp.player === null ? (
                        <span className="ml-2 text-xs font-normal text-neutral-500">
                          (invitado)
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-xs text-neutral-500">{subtituloDe(cp)}</span>
                  </span>
                </span>
                {mostrarSacar ? (
                  <RemovePlayerForm convocatoriaId={convocatoriaId} convocatoriaPlayerId={cp.id} />
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>

      {declinados.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-neutral-500 hover:text-neutral-700">
            Se bajaron de este partido ({declinados.length})
          </summary>
          <ul className="mt-2 divide-y divide-neutral-100">
            {declinados.map((cp) => (
              <li key={cp.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-neutral-700">{nombreDe(cp)}</span>
                  <span className="block text-xs text-neutral-500">{subtituloDe(cp)}</span>
                </span>
                {mostrarSacar ? (
                  <RemovePlayerForm convocatoriaId={convocatoriaId} convocatoriaPlayerId={cp.id} />
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
