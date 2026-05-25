import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/require-role";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { EditForm } from "./edit-form";

const FIELD_LABEL: Record<string, string> = {
  technical: "Técnica",
  physical: "Físico",
  mental: "Mental",
  rating_confidence: "Confianza",
  // Mantenido para mostrar requests viejas (pre-PR B) que aun esten pending.
  edad: "Edad",
  role_field: "Rol",
  position_pref: "Posición preferida",
};

function isJsonObject(v: Json): v is { [k: string]: Json | undefined } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function formatValue(v: Json | undefined): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.map((x) => formatValue(x)).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default async function ProponerCambioPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");

  const { id } = await params;

  const supabase = await createClient();
  const { data: player, error } = await supabase
    .from("players")
    .select("id, nombre, technical, physical, mental, rating_confidence")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo cargar el jugador: ${error.message}`);
  }
  if (!player) {
    notFound();
  }

  // Si ya hay una solicitud sensible pendiente, no mostramos el form: el
  // server action la rechazaria igual (PR #38 / Major 3).
  const { data: openSensitive, error: openErr } = await supabase
    .from("player_change_requests")
    .select("id, proposed_values, old_values, reason, status, created_at")
    .eq("player_id", id)
    .eq("action_type", "update_sensitive_fields")
    .in("status", ["pending", "flagged"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openErr) {
    throw new Error(`No se pudieron leer las solicitudes: ${openErr.message}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/jugadores/${id}`}
          className="text-sm text-neutral-500 transition hover:text-neutral-700"
        >
          ← Volver al detalle
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          Proponer ratings — {player.nombre}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          Los ratings (técnica/físico/mental/confianza) son lo único que el admin no puede cambiar
          solo: pasan por el veedor antes de aplicarse. Modificá lo que quieras y agregá un motivo.
        </p>
      </div>

      {openSensitive ? (
        <PendingNotice
          proposed={openSensitive.proposed_values}
          old={openSensitive.old_values}
          reason={openSensitive.reason}
          playerId={id}
        />
      ) : (
        <EditForm
          initial={{
            id: player.id,
            technical: player.technical,
            physical: player.physical,
            mental: player.mental,
            rating_confidence: player.rating_confidence,
          }}
        />
      )}
    </div>
  );
}

function PendingNotice({
  proposed,
  old,
  reason,
  playerId,
}: {
  proposed: Json;
  old: Json;
  reason: string;
  playerId: string;
}) {
  const proposedObj = isJsonObject(proposed) ? proposed : null;
  const oldObj = isJsonObject(old) ? old : null;
  const fields = proposedObj ? Object.keys(proposedObj) : [];

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-900">
          Ya hay una solicitud en revisión
        </h2>
        <p className="mt-1 text-sm text-amber-900">
          No podés crear otra hasta que el veedor decida sobre esta. Si necesitás cambios distintos,
          esperá la decisión y volvé a proponer.
        </p>
      </div>

      {fields.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Campos en revisión
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {fields.map((f) => (
              <li key={f} className="flex justify-between gap-3">
                <span className="text-neutral-500">{FIELD_LABEL[f] ?? f}</span>
                <span className="text-neutral-900">
                  {formatValue(oldObj?.[f])} → {formatValue(proposedObj?.[f])}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {reason ? (
        <div className="rounded-md border border-amber-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Motivo</p>
          <p className="mt-1 whitespace-pre-line text-sm text-neutral-700">{reason}</p>
        </div>
      ) : null}

      <Link
        href={`/jugadores/${playerId}`}
        className="inline-flex items-center rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50"
      >
        Volver al detalle
      </Link>
    </div>
  );
}
