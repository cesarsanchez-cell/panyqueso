import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

import { DeclineButton } from "./decline-button";

type SearchParams = { declined?: string; error?: string };

const DIA_LABEL = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

function formatPartidoDate(fecha: string): string {
  return new Date(`${fecha}T00:00:00`).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatHora(raw: string): string {
  return raw.slice(0, 5);
}

function formatExpiresShort(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const { data: rows, error } = await supabase.rpc("get_invite_by_token", { p_token: token });

  if (error) {
    return <ErrorShell title="No se pudo cargar el link." detail={error.message} />;
  }

  const invite = rows && rows.length > 0 ? rows[0] : null;

  if (!invite) {
    return (
      <ErrorShell
        title="Link no válido"
        detail="No encontramos ninguna invitación con este código. Pedile al organizador uno nuevo."
      />
    );
  }

  const now = Date.now();
  const expired = new Date(invite.invite_expires_at).getTime() <= now;
  const used = invite.invite_used_at !== null;
  const declined = invite.invite_declined_at !== null;

  if (used) {
    return (
      <InfoShell
        title="Ya aceptaste esta invitación"
        detail="Ingresá a la app con tu celular y contraseña para ver tus próximos partidos."
      />
    );
  }

  if (declined || sp.declined === "1") {
    return (
      <InfoShell
        title="Marcaste que no vas"
        detail="Listo. Si cambiás de opinión, pedile al organizador que te mande un nuevo link."
      />
    );
  }

  if (expired) {
    return (
      <ErrorShell
        title="Link vencido"
        detail="Este link ya no es válido. Pedile al organizador uno nuevo."
      />
    );
  }

  // Estado pending: render del partido y botones.
  const dia = DIA_LABEL[invite.grupo_dia_semana] ?? "—";
  const hora = formatHora(invite.grupo_hora);
  const partidoFecha = invite.convocatoria_fecha
    ? formatPartidoDate(invite.convocatoria_fecha)
    : null;
  const partidoHora = invite.convocatoria_hora ? formatHora(invite.convocatoria_hora) : null;

  return (
    <main className="mx-auto max-w-md px-4 py-8 sm:py-12">
      <div className="space-y-6">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">
            Te invitan al grupo
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">
            {invite.grupo_nombre}
          </h1>
          {invite.invite_nombre_tentativo ? (
            <p className="mt-2 text-sm text-neutral-600">
              Hola <span className="font-medium">{invite.invite_nombre_tentativo}</span>, esta es tu
              invitación.
            </p>
          ) : null}
        </div>

        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {partidoFecha ? "Próximo partido" : "Recurrente"}
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            {partidoFecha ? (
              <Field label="Fecha">
                {partidoFecha} · {partidoHora}
              </Field>
            ) : (
              <Field label="Día y hora">
                Todos los {dia.toLowerCase()} a las {hora}
              </Field>
            )}
            <Field label="Lugar">
              {invite.lugar_nombre}
              {invite.lugar_google_maps_url ? (
                <>
                  {" "}
                  ·{" "}
                  <a
                    href={invite.lugar_google_maps_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-neutral-900 underline"
                  >
                    Abrir en Maps
                  </a>
                </>
              ) : null}
            </Field>
            <Field label="Cupo">{invite.grupo_cupo_titulares} titulares</Field>
            <Field label="Tu teléfono">
              <span className="font-mono">{invite.invite_phone}</span>
            </Field>
          </dl>
          <p className="mt-4 text-xs text-neutral-500">
            El link vence el {formatExpiresShort(invite.invite_expires_at)}.
          </p>
        </section>

        {sp.error === "decline_failed" ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            No se pudo registrar tu respuesta. Refrescá la página y probá de nuevo.
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/invite/${token}/aceptar`}
            className="flex-1 rounded-md bg-neutral-900 px-4 py-3 text-center text-base font-semibold text-white shadow-sm transition hover:bg-neutral-800"
          >
            Voy
          </Link>
          <DeclineButton token={token} />
        </div>

        <p className="text-center text-xs text-neutral-500">
          Si tenés alguna duda, escribile a la persona que te mandó este link.
        </p>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="text-xs uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="text-right text-sm text-neutral-900">{children}</dd>
    </div>
  );
}

function ErrorShell({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold text-red-900">{title}</h1>
        <p className="mt-2 text-sm text-red-800">{detail}</p>
      </div>
    </main>
  );
}

function InfoShell({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold text-emerald-900">{title}</h1>
        <p className="mt-2 text-sm text-emerald-800">{detail}</p>
      </div>
    </main>
  );
}
