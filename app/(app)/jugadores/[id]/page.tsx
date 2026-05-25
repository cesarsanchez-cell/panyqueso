import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/require-role";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { AdminPlayerForm } from "./admin-player-form";
import { AdminResetPassword } from "./admin-reset-password";
import { PrivateNotesForm } from "./private-notes-form";

type SearchParams = { proposed?: string };

type PlayerStatus = Database["public"]["Enums"]["player_status"];
type PlayerRoleField = Database["public"]["Enums"]["player_role_field"];
type PositionPref = Database["public"]["Enums"]["position_pref"];
type RatingConfidence = Database["public"]["Enums"]["rating_confidence"];
type RequestAction = Database["public"]["Enums"]["change_request_action"];
type RequestStatus = Database["public"]["Enums"]["change_request_status"];

const REQUEST_ACTION_LABEL: Record<RequestAction, string> = {
  create_player: "Nuevo jugador",
  update_sensitive_fields: "Cambio sensible",
  deactivate_player: "Desactivación",
  reactivate_player: "Reactivación",
  assign_initial_ratings: "Calificación inicial",
};

const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "Pendiente",
  flagged: "Marcada",
  approved: "Aprobada",
  rejected: "Rechazada",
};

const REQUEST_STATUS_BADGE: Record<RequestStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  flagged: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  approved: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  rejected: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

const STATUS_LABEL: Record<PlayerStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  inactive: "Inactivo",
};

const ROLE_FIELD_LABEL: Record<PlayerRoleField, string> = {
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

const CONFIDENCE_LABEL: Record<RatingConfidence, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
};

const STATUS_BADGE: Record<PlayerStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  approved: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  inactive: "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function JugadorDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requireRole(["admin", "veedor"]);

  const { id } = await params;
  const sp = await searchParams;
  const isAdmin = ctx.profile.role === "admin";
  const showProposedFlash = sp.proposed === "1";

  const supabase = await createClient();
  const { data: player, error } = await supabase
    .from("players")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo cargar el jugador: ${error.message}`);
  }

  if (!player) {
    notFound();
  }

  const { data: requestsRaw, error: requestsError } = await supabase
    .from("player_change_requests")
    .select(
      `id, action_type, status, reason, created_at, reviewed_at, review_comment,
       requester:profiles!requested_by(nombre),
       reviewer:profiles!reviewed_by(nombre)`,
    )
    .eq("player_id", id)
    .order("created_at", { ascending: false });

  if (requestsError) {
    throw new Error(`No se pudieron cargar las solicitudes: ${requestsError.message}`);
  }

  const requests = requestsRaw ?? [];
  const pendingRequests = requests.filter((r) => r.status === "pending" || r.status === "flagged");
  const hasPendingSensitive = pendingRequests.some(
    (r) => r.action_type === "update_sensitive_fields",
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/jugadores"
          className="text-sm text-neutral-500 transition hover:text-neutral-700"
        >
          ← Volver al listado
        </Link>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight text-neutral-900">
            {player.nombre}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {player.edad} años · {ROLE_FIELD_LABEL[player.role_field]}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[player.status]}`}
        >
          {STATUS_LABEL[player.status]}
        </span>
      </div>

      {showProposedFlash ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Solicitud de ratings creada. Queda pendiente de aprobación por un veedor.
        </div>
      ) : null}

      {pendingRequests.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-medium">
            {pendingRequests.length === 1
              ? "Hay 1 solicitud en revisión sobre este jugador."
              : `Hay ${pendingRequests.length} solicitudes en revisión sobre este jugador.`}
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {pendingRequests.map((r) => (
              <li key={r.id}>
                {REQUEST_ACTION_LABEL[r.action_type]} · {REQUEST_STATUS_LABEL[r.status]} ·{" "}
                {formatDateTime(r.created_at)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {isAdmin ? (
        <AdminPlayerForm
          playerId={player.id}
          initial={{
            nombre: player.nombre,
            fecha_nacimiento: player.fecha_nacimiento,
            role_field: player.role_field,
            position_pref: player.position_pref,
            positions_possible: player.positions_possible,
            phone: player.phone,
            email: player.email,
            apodo: player.apodo,
            pierna_habil: player.pierna_habil,
            status: player.status,
          }}
        />
      ) : (
        <>
          <Section title="Posición">
            <Field label="Preferida" value={POSITION_LABEL[player.position_pref]} />
            <Field
              label="Posibles"
              value={
                player.positions_possible.length > 0
                  ? player.positions_possible.map((p) => POSITION_LABEL[p]).join(" · ")
                  : "—"
              }
            />
          </Section>
        </>
      )}

      <Section title="Ratings">
        <Field label="Técnica" value={`${player.technical} / 10`} />
        <Field label="Físico" value={`${player.physical} / 10`} />
        <Field label="Mental" value={`${player.mental} / 10`} />
        <Field
          label="Score interno"
          value={player.internal_score === null ? "—" : Number(player.internal_score).toFixed(2)}
        />
        <Field label="Confianza" value={CONFIDENCE_LABEL[player.rating_confidence]} />
        {isAdmin && !hasPendingSensitive ? (
          <div className="pt-2">
            <Link
              href={`/jugadores/${player.id}/proponer-cambio`}
              className="inline-flex items-center rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50"
            >
              Proponer ratings (requiere veedor)
            </Link>
          </div>
        ) : null}
      </Section>

      {isAdmin ? (
        <PrivateNotesForm playerId={player.id} initial={player.private_notes ?? ""} />
      ) : player.private_notes ? (
        <Section title="Notas privadas">
          <p className="whitespace-pre-line text-sm text-neutral-700">{player.private_notes}</p>
        </Section>
      ) : null}

      {isAdmin ? <AdminResetPassword playerId={player.id} playerNombre={player.nombre} /> : null}

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Solicitudes
        </h2>
        {requests.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            Sin solicitudes registradas para este jugador.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100">
            {requests.map((r) => (
              <li key={r.id} className="py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-neutral-900">
                        {REQUEST_ACTION_LABEL[r.action_type]}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${REQUEST_STATUS_BADGE[r.status]}`}
                      >
                        {REQUEST_STATUS_LABEL[r.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      Solicitada por {r.requester?.nombre ?? "—"} · {formatDateTime(r.created_at)}
                      {r.reviewed_at ? (
                        <>
                          {" · "}revisada por {r.reviewer?.nombre ?? "—"} ·{" "}
                          {formatDateTime(r.reviewed_at)}
                        </>
                      ) : null}
                    </p>
                    {r.reason ? (
                      <p className="mt-1 whitespace-pre-line text-xs text-neutral-700">
                        Motivo: {r.reason}
                      </p>
                    ) : null}
                    {r.review_comment ? (
                      <p className="mt-1 whitespace-pre-line text-xs text-neutral-700">
                        Comentario: {r.review_comment}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Section title="Auditoría">
        <Field label="Creado" value={formatDate(player.created_at)} />
        <Field label="Actualizado" value={formatDate(player.updated_at)} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      <dl className="mt-3 space-y-2 text-sm">{children}</dl>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-neutral-900">{value}</dd>
    </div>
  );
}
