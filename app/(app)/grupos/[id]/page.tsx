import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/require-role";
import { formatArLocal } from "@/lib/phone";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

import { ArchiveGrupoForm } from "./archive-form";
import {
  CoordinadoresSection,
  type AssignedCoordinador,
  type EligibleCoordinador,
} from "./coordinadores-section";
import { ConvocatoriaCiclo } from "./convocatoria-ciclo";
import { EditGrupoForm } from "./edit-grupo-form";
import { MembersSections } from "./members-sections";
import { AddMemberForm } from "./membership-forms";
import { GroupJoinLinkSection } from "./group-join-link";
import { aprobarJoinRequest, rechazarJoinRequest } from "../actions";
import { PendingInvitesList, type PendingInvite } from "./pending-invites";
import { PremioPinochoToggle } from "./premio-pinocho-toggle";
import { ProdeResetForm } from "./prode-reset-form";
import { ShareProdeButton } from "./share-prode-button";
import { ProdeTablaTable, type ProdeTablaRow } from "../../historial/prode-tabla";

const DIA_LABEL = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

export default async function GrupoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRole(["admin", "coordinador"]);
  const isAdmin = ctx.profile.role === "admin";
  const { id } = await params;

  const supabase = await createClient();

  const { data: grupo, error: grupoErr } = await supabase
    .from("grupos")
    .select(
      "id, nombre, lugar_id, dia_semana, hora, cupo_titulares, status, auto_renovar, join_token, join_requiere_aprobacion, premio_pinocho, modo_confirmacion, lugar:lugares!lugar_id(nombre)",
    )
    .eq("id", id)
    .maybeSingle();

  if (grupoErr) {
    throw new Error(`No se pudo cargar el grupo: ${grupoErr.message}`);
  }
  if (!grupo) notFound();

  const nowIso = new Date().toISOString();
  const [
    { data: membresias, error: memErr },
    { data: lugares },
    { data: players },
    { data: pendingInvitesRaw, error: invitesErr },
    { data: openConvRow },
    { data: coordRows },
  ] = await Promise.all([
    supabase
      .from("grupo_membresias")
      .select("id, status, joined_at, player:players!player_id(id, nombre, apodo, auth_user_id)")
      .eq("grupo_id", id)
      .eq("status", "activo")
      .order("joined_at", { ascending: true }),
    supabase.from("lugares").select("id, nombre").order("nombre", { ascending: true }),
    supabase
      .from("players")
      .select("id, nombre, apodo, status")
      .eq("status", "approved")
      .order("nombre", { ascending: true }),
    supabase
      .from("player_invitations")
      .select("id, phone, nombre_tentativo, token, expires_at")
      .eq("grupo_id", id)
      .is("used_at", null)
      .is("declined_at", null)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false }),
    supabase
      .from("convocatorias")
      .select("id, fecha, cierre_at")
      .eq("grupo_id", id)
      .eq("status", "abierta")
      .order("fecha", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("coordinador_grupos")
      .select("id, profile_id, profile:profiles!profile_id(nombre)")
      .eq("grupo_id", id),
  ]);

  // Solicitudes de alta pendientes (link /g con aprobación requerida).
  const { data: joinRequests } = await supabase.rpc("listar_join_requests", { p_grupo_id: id });

  // Conteos + roster de la convocatoria abierta (si hay).
  type ConvRosterMember = {
    playerId: string | null;
    nombre: string;
    apodo: string | null;
    rol: "titular" | "suplente";
    orden: number | null;
    attendanceStatus: string;
    esInvitadoLibre: boolean;
  };
  let openConv: {
    id: string;
    fecha: string;
    cierre_at: string | null;
    invitedCount: number;
    confirmadosCount: number;
    declinadosCount: number;
    titulares: ConvRosterMember[];
    suplentes: ConvRosterMember[];
    declinados: ConvRosterMember[];
  } | null = null;
  if (openConvRow) {
    const { data: cpRows } = await supabase
      .from("convocatoria_players")
      .select(
        "player_id, nombre_libre, attendance_status, rol_en_convocatoria, orden_suplente, player:players!player_id(nombre, apodo)",
      )
      .eq("convocatoria_id", openConvRow.id);
    const rows = cpRows ?? [];
    const mapped: ConvRosterMember[] = rows.map((r) => {
      const esInvitado = r.player_id === null;
      return {
        playerId: r.player_id,
        nombre: esInvitado ? (r.nombre_libre ?? "—") : (r.player?.nombre ?? "—"),
        apodo: esInvitado ? null : (r.player?.apodo ?? null),
        rol: r.rol_en_convocatoria as "titular" | "suplente",
        orden: r.orden_suplente,
        attendanceStatus: r.attendance_status,
        esInvitadoLibre: esInvitado,
      };
    });
    const activos = mapped.filter((m) => m.attendanceStatus !== "declinado");
    openConv = {
      id: openConvRow.id,
      fecha: openConvRow.fecha,
      cierre_at: openConvRow.cierre_at,
      invitedCount: activos.length,
      confirmadosCount: activos.filter((m) => m.attendanceStatus === "confirmado").length,
      declinadosCount: mapped.filter((m) => m.attendanceStatus === "declinado").length,
      titulares: activos
        .filter((m) => m.rol === "titular")
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      suplentes: activos
        .filter((m) => m.rol === "suplente")
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
      declinados: mapped.filter((m) => m.attendanceStatus === "declinado"),
    };
  }

  if (invitesErr) {
    throw new Error(`No se pudieron cargar las invitaciones: ${invitesErr.message}`);
  }

  if (memErr) {
    throw new Error(`No se pudieron cargar las membresías: ${memErr.message}`);
  }

  const memList = membresias ?? [];

  // Estado de avisos push por miembro (solo admin): quién NO los activó, para
  // poder pedírselo por privado. Se lee con service-role porque la RLS de
  // push_subscriptions solo deja ver las propias.
  const memberPlayerIds = memList.map((m) => m.player?.id).filter(Boolean) as string[];
  let playerIdsConAvisos: string[] = [];
  if (memberPlayerIds.length > 0) {
    const adminClient = createServiceClient();
    const { data: subs } = await adminClient
      .from("push_subscriptions")
      .select("player_id")
      .in("player_id", memberPlayerIds);
    playerIdsConAvisos = Array.from(new Set((subs ?? []).map((s) => s.player_id)));
  }

  const ocupados = new Set(memList.map((m) => m.player?.id).filter(Boolean) as string[]);
  const availablePlayers = (players ?? [])
    .filter((p) => !ocupados.has(p.id))
    .map((p) => ({ id: p.id, nombre: p.apodo ? `${p.nombre} (${p.apodo})` : p.nombre }));

  const assignedCoordinadores: AssignedCoordinador[] = (coordRows ?? []).map((r) => ({
    id: r.id,
    profileId: r.profile_id,
    nombre: r.profile?.nombre?.trim() || "—",
  }));
  const assignedProfileIds = new Set(assignedCoordinadores.map((c) => c.profileId));

  // Elegibles a coordinador: miembros del grupo que tienen cuenta (auth_user_id)
  // y cuyo rol se puede promover (player / sin rol / ya coordinador). Se excluyen
  // admin y veedor (rangos excluyentes) y quien ya coordina este grupo.
  const memberAuthIds = memList
    .map((m) => m.player?.auth_user_id)
    .filter((v): v is string => Boolean(v));
  const roleByProfile = new Map<string, string | null>();
  if (memberAuthIds.length > 0) {
    const { data: memberProfiles } = await supabase
      .from("profiles")
      .select("id, role")
      .in("id", memberAuthIds);
    for (const p of memberProfiles ?? []) roleByProfile.set(p.id, p.role);
  }
  const eligibleCoordinadores: EligibleCoordinador[] = memList
    .filter((m) => {
      const authId = m.player?.auth_user_id;
      if (!authId || assignedProfileIds.has(authId)) return false;
      const r = roleByProfile.get(authId);
      return r == null || r === "player" || r === "coordinador";
    })
    .map((m) => ({
      profileId: m.player!.auth_user_id as string,
      nombre: m.player?.apodo
        ? `${m.player.nombre} (${m.player.apodo})`
        : m.player?.nombre?.trim() || "—",
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const isActive = grupo.status === "activo";

  // Tabla del Prode 🔮 del grupo (año en curso). El admin puede verla y
  // compartirla; el RPC ya autoriza admin además de los miembros.
  const prodeYear = new Date().getFullYear();
  const { data: prodeTablaRaw } = await supabase.rpc("get_prode_tabla", {
    p_grupo_id: id,
    p_year: prodeYear,
  });
  const prodeRows: ProdeTablaRow[] = (prodeTablaRaw ?? []).map((t) => ({
    playerId: t.player_id,
    nombre: t.nombre ?? "—",
    apodo: t.apodo,
    puntos: t.puntos,
    aciertosExactos: t.aciertos_exactos,
    pronosticos: t.pronosticos,
  }));

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : "";

  const pendingInvites: PendingInvite[] = (pendingInvitesRaw ?? []).map((row) => ({
    id: row.id,
    phone: row.phone,
    nombre: row.nombre_tentativo ?? formatArLocal(row.phone),
    link: origin ? `${origin}/invite/${row.token}` : `/invite/${row.token}`,
    expiresAt: row.expires_at,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/grupos" className="text-sm text-neutral-500 transition hover:text-neutral-700">
          ← Volver al listado
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{grupo.nombre}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {DIA_LABEL[grupo.dia_semana]} {grupo.hora.slice(0, 5)} · {grupo.lugar?.nombre ?? "—"} ·
            cupo {grupo.cupo_titulares}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isActive ? (
            <Link
              href={`/grupos/${grupo.id}/importar`}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
            >
              Importar desde WA
            </Link>
          ) : null}
          {isAdmin ? <ArchiveGrupoForm grupoId={grupo.id} isActive={isActive} /> : null}
        </div>
      </div>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Configuración
        </h2>
        <div className="mt-4">
          <EditGrupoForm
            grupoId={grupo.id}
            initial={{
              nombre: grupo.nombre,
              lugar_id: grupo.lugar_id,
              dia_semana: grupo.dia_semana,
              hora: grupo.hora,
              cupo_titulares: grupo.cupo_titulares,
              modo_confirmacion: grupo.modo_confirmacion,
            }}
            lugares={lugares ?? []}
          />
        </div>
      </section>

      {isAdmin ? (
        <CoordinadoresSection
          grupoId={grupo.id}
          assigned={assignedCoordinadores}
          eligible={eligibleCoordinadores}
        />
      ) : null}

      {isActive && grupo.modo_confirmacion === "presentismo" ? (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Cancha en vivo
          </h2>
          <p className="mt-1 text-sm text-emerald-900">
            Este grupo confirma por presentismo: el check-in se hace en la cancha por orden de
            llegada y los equipos se arman ahí.
          </p>
          <Link
            href={`/grupos/${grupo.id}/cancha`}
            className="mt-3 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800"
          >
            Ir a la cancha →
          </Link>
        </section>
      ) : null}

      {isActive && grupo.modo_confirmacion !== "presentismo" ? (
        <ConvocatoriaCiclo grupoId={grupo.id} autoRenovar={grupo.auto_renovar} open={openConv} />
      ) : null}

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Agregar miembro
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          El grupo es una bolsa de jugadores candidatos. Cuando se crea una convocatoria, los
          primeros {grupo.cupo_titulares} por orden de alta entran como titulares, el resto a la
          lista de espera.
        </p>
        <div className="mt-3">
          {availablePlayers.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No hay jugadores approved disponibles. Agregá jugadores desde{" "}
              <Link href="/jugadores" className="underline">
                Jugadores
              </Link>
              .
            </p>
          ) : (
            <AddMemberForm grupoId={grupo.id} availablePlayers={availablePlayers} />
          )}
        </div>
      </section>

      {isActive ? (
        <GroupJoinLinkSection
          grupoId={grupo.id}
          joinToken={grupo.join_token}
          origin={origin}
          grupoNombre={grupo.nombre}
          requiereAprobacion={grupo.join_requiere_aprobacion}
        />
      ) : null}

      {isActive && (joinRequests ?? []).length > 0 ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-700">
              Solicitudes de alta
            </h2>
            <p className="text-sm text-amber-800">{(joinRequests ?? []).length}</p>
          </div>
          <p className="mt-1 text-xs text-amber-700">
            Entraron por el link y esperan tu aprobación para sumarse al grupo.
          </p>
          <ul className="mt-3 space-y-2">
            {(joinRequests ?? []).map((r) => (
              <li
                key={r.request_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2"
              >
                <span className="min-w-0 text-sm text-neutral-900">
                  {r.nombre}
                  <span className="ml-2 font-mono text-xs text-neutral-500">{r.phone}</span>
                  {r.kind === "reclamo" ? (
                    <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-800">
                      ya existía{r.tiene_login ? "" : " · sin login"}
                    </span>
                  ) : null}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <form action={aprobarJoinRequest}>
                    <input type="hidden" name="grupo_id" value={grupo.id} />
                    <input type="hidden" name="request_id" value={r.request_id} />
                    <button
                      type="submit"
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                    >
                      Aprobar
                    </button>
                  </form>
                  <form action={rechazarJoinRequest}>
                    <input type="hidden" name="grupo_id" value={grupo.id} />
                    <input type="hidden" name="request_id" value={r.request_id} />
                    <button
                      type="submit"
                      className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-red-50 hover:text-red-700"
                    >
                      Rechazar
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Invitaciones pendientes
          </h2>
          <p className="text-sm text-neutral-700">{pendingInvites.length}</p>
        </div>
        {pendingInvites.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            Sin invitaciones pendientes. Generá nuevas desde{" "}
            {isActive ? (
              <Link href={`/grupos/${grupo.id}/importar`} className="underline">
                Importar desde WA
              </Link>
            ) : (
              "Importar desde WA (grupo archivado)"
            )}
            .
          </p>
        ) : (
          <PendingInvitesList invites={pendingInvites} />
        )}
      </section>

      <MembersSections
        miembros={memList}
        cupoTitulares={grupo.cupo_titulares}
        playerIdsConAvisos={playerIdsConAvisos}
      />

      <section className="rounded-lg border border-indigo-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-indigo-700">
          🔮 Tabla del Prode {prodeYear}
        </h2>
        {prodeRows.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            Todavía nadie sumó puntos en el Prode este año. Cuando se jueguen partidos con
            pronósticos cargados, el ranking aparece acá.
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-neutral-500">
              Ranking del año: 3 pts si se clava el resultado, 1 pt si se acierta quién gana.
            </p>
            <div className="mt-4">
              <ProdeTablaTable rows={prodeRows} myPlayerId={null} />
            </div>
            <div className="mt-4">
              <ShareProdeButton grupoId={grupo.id} year={prodeYear} />
            </div>
          </>
        )}

        <div className="mt-5 border-t border-neutral-100 pt-4">
          <p className="text-xs text-neutral-500">
            La tabla acumula por año. Para empezar de cero la temporada, podés borrar todos los
            pronósticos de {prodeYear} de este grupo.
          </p>
          <div className="mt-3">
            <ProdeResetForm grupoId={grupo.id} year={prodeYear} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          🏆 Premios votados
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Después de cada partido, los que jugaron votan los premios: ⭐ Figura y 🔪 Carnicero (el
          más rudo) van siempre. El 🪵 Pinocho (el peor) es opcional: prendelo solo si al grupo le
          gusta la cargada.
        </p>
        <div className="mt-4">
          <PremioPinochoToggle grupoId={grupo.id} initial={grupo.premio_pinocho} />
        </div>
      </section>
    </div>
  );
}
