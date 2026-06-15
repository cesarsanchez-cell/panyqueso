import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { suggestNextSessionDate, todayInArgentina } from "@/lib/presentismo/suggest-date";
import type { PresentismoArmado } from "@/lib/teams/presentismo";

import { CanchaLive, type PresentRow, type MemberRow } from "./cancha-live";

export default async function CanchaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin", "coordinador"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data: grupo } = await supabase
    .from("grupos")
    .select("id, nombre, status, modo_confirmacion, dia_semana, hora")
    .eq("id", id)
    .maybeSingle();
  if (!grupo) notFound();

  // Sesión presentismo abierta del grupo (si hay).
  const { data: conv } = await supabase
    .from("convocatorias")
    .select("id, fecha, presentismo_armado")
    .eq("grupo_id", id)
    .eq("modo", "presentismo")
    .eq("status", "abierta")
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Para sugerir la fecha de la próxima sesión: hoy (TZ Argentina) + las fechas
  // ya ocupadas del grupo (convocatorias no canceladas).
  const hoy = todayInArgentina();
  const { data: takenRows } = await supabase
    .from("convocatorias")
    .select("fecha")
    .eq("grupo_id", id)
    .neq("status", "cancelada");
  const fechaSugerida = suggestNextSessionDate(
    hoy,
    grupo.dia_semana,
    (takenRows ?? []).map((r) => r.fecha),
  );

  let present: PresentRow[] = [];
  let membersAvailable: MemberRow[] = [];

  if (conv) {
    const { data: cpRows } = await supabase
      .from("convocatoria_players")
      .select("player_id, llegada_at, player:players!player_id(id, nombre, apodo, is_guest)")
      .eq("convocatoria_id", conv.id)
      .not("llegada_at", "is", null)
      .neq("attendance_status", "declinado")
      .order("llegada_at", { ascending: true });

    present = (cpRows ?? [])
      .filter((r) => r.player)
      .map((r) => ({
        playerId: r.player!.id,
        nombre: r.player!.nombre,
        apodo: r.player!.apodo,
        esProbador: r.player!.is_guest ?? false,
        llegadaAt: r.llegada_at,
      }));

    const presentIds = new Set(present.map((p) => p.playerId));

    const { data: memRows } = await supabase
      .from("grupo_membresias")
      .select("player:players!player_id(id, nombre, apodo)")
      .eq("grupo_id", id)
      .eq("status", "activo")
      .order("joined_at", { ascending: true });

    membersAvailable = (memRows ?? [])
      .map((m) => m.player)
      .filter((p): p is NonNullable<typeof p> => p !== null && !presentIds.has(p.id))
      .map((p) => ({ playerId: p.id, nombre: p.nombre, apodo: p.apodo }));
  }

  const armado = (conv?.presentismo_armado ?? null) as unknown as PresentismoArmado | null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/grupos/${grupo.id}`}
          className="text-sm text-neutral-500 transition hover:text-neutral-700"
        >
          ← Volver al grupo
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Cancha en vivo</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {grupo.nombre} · check-in por orden de llegada
        </p>
      </div>

      {grupo.status !== "activo" ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          El grupo está archivado.
        </p>
      ) : (
        <CanchaLive
          // Remonta al cruzar el borde sesión↔sin-sesión: así, al volver de
          // confirmar/cancelar, el selector toma la fecha sugerida nueva (la
          // próxima libre) en vez de quedarse con la última usada.
          key={conv?.id ?? "abrir"}
          grupoId={grupo.id}
          convocatoriaId={conv?.id ?? null}
          present={present}
          membersAvailable={membersAvailable}
          armado={armado}
          fechaSugerida={fechaSugerida}
          fechaMinima={hoy}
        />
      )}
    </div>
  );
}
