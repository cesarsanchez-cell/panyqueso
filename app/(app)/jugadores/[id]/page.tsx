import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/require-role";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type PlayerStatus = Database["public"]["Enums"]["player_status"];
type PlayerRoleField = Database["public"]["Enums"]["player_role_field"];
type PositionPref = Database["public"]["Enums"]["position_pref"];
type RatingConfidence = Database["public"]["Enums"]["rating_confidence"];

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

export default async function JugadorDetallePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin", "veedor"]);

  const { id } = await params;

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

      <Section title="Ratings">
        <Field label="Técnica" value={`${player.technical} / 10`} />
        <Field label="Físico" value={`${player.physical} / 10`} />
        <Field label="Mental" value={`${player.mental} / 10`} />
        <Field
          label="Score interno"
          value={player.internal_score === null ? "—" : Number(player.internal_score).toFixed(2)}
        />
        <Field label="Confianza" value={CONFIDENCE_LABEL[player.rating_confidence]} />
      </Section>

      {player.private_notes ? (
        <Section title="Notas privadas">
          <p className="whitespace-pre-line text-sm text-neutral-700">{player.private_notes}</p>
        </Section>
      ) : null}

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
