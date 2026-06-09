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
  // Subcomponentes (modelo v2).
  phys_power: "Físico · Potencia",
  phys_speed: "Físico · Velocidad",
  phys_stamina: "Físico · Resistencia",
  ment_tactical: "Mental · Orden táctico",
  ment_resilience: "Mental · Resiliencia",
  ment_attitude: "Mental · Actitud",
  tech_passing: "Técnica · Pase",
  tech_finishing: "Técnica · Eficacia",
  tech_linkup: "Técnica · Asociación",
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
    .select(
      "id, nombre, technical, physical, mental, rating_confidence, phys_power, phys_speed, phys_stamina, ment_tactical, ment_resilience, ment_attitude, tech_passing, tech_finishing, tech_linkup",
    )
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

  const { data: gateData } = await supabase.rpc("requiere_veedor");
  const requiereVeedor = gateData === true;

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
          {requiereVeedor ? "Proponer ratings" : "Editar ratings"} — {player.nombre}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          {requiereVeedor
            ? "Los ratings (técnica/físico/mental/confianza) pasan por el veedor antes de aplicarse. Modificá lo que quieras y agregá un motivo."
            : "Modificá los ratings (técnica/físico/mental/confianza) y agregá un motivo. Se aplican directo (la auditoría del veedor está desactivada)."}
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
          requiereVeedor={requiereVeedor}
          initial={{
            id: player.id,
            rating_confidence: player.rating_confidence,
            // Si un sub está en null (jugador nunca editado con el modelo v2),
            // mostramos el valor de su dimensión como punto de partida.
            phys_power: player.phys_power ?? player.physical,
            phys_speed: player.phys_speed ?? player.physical,
            phys_stamina: player.phys_stamina ?? player.physical,
            ment_tactical: player.ment_tactical ?? player.mental,
            ment_resilience: player.ment_resilience ?? player.mental,
            ment_attitude: player.ment_attitude ?? player.mental,
            tech_passing: player.tech_passing ?? player.technical,
            tech_finishing: player.tech_finishing ?? player.technical,
            tech_linkup: player.tech_linkup ?? player.technical,
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
