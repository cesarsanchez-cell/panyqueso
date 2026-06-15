import { createClient } from "@/lib/supabase/server";

import { JoinForm } from "./join-form";

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

export default async function GroupJoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ pendiente?: string; reclamo?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const { data: rows, error } = await supabase.rpc("get_group_by_join_token", { p_token: token });

  if (error) {
    return <ErrorShell title="No se pudo cargar el link." detail={error.message} />;
  }

  const grupo = rows && rows.length > 0 ? rows[0] : null;

  if (!grupo) {
    return (
      <ErrorShell
        title="Link no válido"
        detail="Este link no está activo o el grupo ya no existe. Pedile al organizador uno nuevo."
      />
    );
  }

  // El alta quedó pendiente de aprobación del organizador (no hay auto-login).
  if (sp.pendiente === "1") {
    return (
      <InfoShell
        title="¡Listo! Tu solicitud quedó pendiente"
        detail="El organizador del grupo tiene que aprobarte. Cuando lo haga, ingresá en la app con tu celular y la contraseña que elegiste."
      />
    );
  }

  // El teléfono ya existía → se registró un reclamo (FUT-120).
  if (sp.reclamo === "creado") {
    return (
      <InfoShell
        title="Ese número ya estaba registrado"
        detail="Te anotamos para este grupo. El organizador tiene que confirmar que sos vos; cuando lo haga, vas a poder entrar con tu celular."
      />
    );
  }
  if (sp.reclamo === "ya_pendiente") {
    return (
      <InfoShell
        title="Ya tenés una solicitud pendiente"
        detail="El organizador ya recibió tu pedido para este grupo. Esperá a que lo confirme."
      />
    );
  }
  if (sp.reclamo === "ya_miembro") {
    return (
      <InfoShell
        title="Ya estás en este grupo"
        detail="Tu número ya es parte del grupo. Ingresá en la app con tu celular y tu contraseña."
      />
    );
  }

  const dia = DIA_LABEL[grupo.grupo_dia_semana] ?? "—";
  const hora = formatHora(grupo.grupo_hora);

  return (
    <main className="mx-auto max-w-md px-4 py-8 sm:py-12">
      <div className="space-y-6">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">
            Te invitan al grupo
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900">
            {grupo.grupo_nombre}
          </h1>
        </div>

        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            El grupo juega
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Field label="Día y hora">
              Todos los {dia.toLowerCase()} a las {hora}
            </Field>
            <Field label="Lugar">
              {grupo.lugar_nombre}
              {grupo.lugar_google_maps_url ? (
                <>
                  {" "}
                  ·{" "}
                  <a
                    href={grupo.lugar_google_maps_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-neutral-900 underline"
                  >
                    Abrir en Maps
                  </a>
                </>
              ) : null}
            </Field>
            <Field label="Cupo">{grupo.grupo_cupo_titulares} titulares</Field>
          </dl>
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Anotate
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Completá tus datos y creá tu cuenta. Vas a entrar a la app con tu celular y la
            contraseña que elijas.
          </p>
          {grupo.grupo_requiere_aprobacion ? (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Este grupo aprueba a los nuevos: tu alta queda pendiente hasta que el organizador te
              confirme.
            </p>
          ) : null}
          <div className="mt-4">
            <JoinForm token={token} />
          </div>
        </section>

        <p className="text-center text-xs text-neutral-500">
          Si tenés alguna duda, escribile a la persona que te pasó este link.
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
