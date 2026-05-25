import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

import { ArchiveGrupoForm } from "./archive-form";
import { EditGrupoForm } from "./edit-grupo-form";
import { AddMemberForm, DemoteForm, PromoteForm, RemoveMemberForm } from "./membership-forms";
import { PendingInvitesList, type PendingInvite } from "./pending-invites";

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
  await requireRole("admin");
  const { id } = await params;

  const supabase = await createClient();

  const { data: grupo, error: grupoErr } = await supabase
    .from("grupos")
    .select(
      "id, nombre, lugar_id, dia_semana, hora, cupo_titulares, status, lugar:lugares!lugar_id(nombre)",
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
  ] = await Promise.all([
    supabase
      .from("grupo_membresias")
      .select("id, tipo, orden, status, joined_at, player:players!player_id(id, nombre, apodo)")
      .eq("grupo_id", id)
      .eq("status", "activo")
      .order("tipo", { ascending: true })
      .order("orden", { ascending: true, nullsFirst: true }),
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
  ]);

  if (invitesErr) {
    throw new Error(`No se pudieron cargar las invitaciones: ${invitesErr.message}`);
  }

  if (memErr) {
    throw new Error(`No se pudieron cargar las membresías: ${memErr.message}`);
  }

  const memList = membresias ?? [];
  const titulares = memList.filter((m) => m.tipo === "titular");
  const suplentes = memList.filter((m) => m.tipo === "suplente");

  const ocupados = new Set(memList.map((m) => m.player?.id).filter(Boolean) as string[]);
  const availablePlayers = (players ?? [])
    .filter((p) => !ocupados.has(p.id))
    .map((p) => ({ id: p.id, nombre: p.apodo ? `${p.nombre} (${p.apodo})` : p.nombre }));

  const hayCupoTitular = titulares.length < grupo.cupo_titulares;
  const isActive = grupo.status === "activo";

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : "";

  const pendingInvites: PendingInvite[] = (pendingInvitesRaw ?? []).map((row) => ({
    id: row.id,
    phone: row.phone,
    nombre: row.nombre_tentativo ?? row.phone,
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
          <ArchiveGrupoForm grupoId={grupo.id} isActive={isActive} />
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
            }}
            lugares={lugares ?? []}
          />
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Agregar miembro
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          {hayCupoTitular
            ? `Hay ${grupo.cupo_titulares - titulares.length} cupo(s) de titular libre(s).`
            : "Cupo de titulares lleno. Nuevos miembros van a la cola de suplentes."}
        </p>
        <div className="mt-3">
          {availablePlayers.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No hay jugadores approved disponibles. Cargá nuevos jugadores en{" "}
              <Link href="/jugadores/nuevo" className="underline">
                /jugadores/nuevo
              </Link>
              .
            </p>
          ) : (
            <AddMemberForm
              grupoId={grupo.id}
              availablePlayers={availablePlayers}
              hayCupoTitular={hayCupoTitular}
            />
          )}
        </div>
      </section>

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

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Titulares
          </h2>
          <p className="text-sm text-neutral-700">
            {titulares.length} de {grupo.cupo_titulares}
          </p>
        </div>
        {titulares.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Sin titulares todavía.</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100">
            {titulares.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="text-sm font-medium text-neutral-900">
                  {m.player?.nombre ?? "—"}
                  {m.player?.apodo ? (
                    <span className="ml-2 text-xs font-normal text-neutral-500">
                      ({m.player.apodo})
                    </span>
                  ) : null}
                </span>
                <div className="flex items-center gap-2">
                  <DemoteForm membresiaId={m.id} />
                  <RemoveMemberForm membresiaId={m.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Cola de suplentes (FIFO)
          </h2>
          <p className="text-sm text-neutral-700">{suplentes.length}</p>
        </div>
        {suplentes.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Sin suplentes en cola.</p>
        ) : (
          <ol className="mt-3 divide-y divide-neutral-100">
            {suplentes.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="flex items-center gap-3">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-700">
                    {m.orden ?? "?"}
                  </span>
                  <span className="text-sm font-medium text-neutral-900">
                    {m.player?.nombre ?? "—"}
                    {m.player?.apodo ? (
                      <span className="ml-2 text-xs font-normal text-neutral-500">
                        ({m.player.apodo})
                      </span>
                    ) : null}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <PromoteForm membresiaId={m.id} />
                  <RemoveMemberForm membresiaId={m.id} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
