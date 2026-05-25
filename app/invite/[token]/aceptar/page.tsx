import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

import { SignupForm } from "./signup-form";

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

export default async function AceptarInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await createClient();
  const { data: rows } = await supabase.rpc("get_invite_by_token", { p_token: token });
  const invite = rows && rows.length > 0 ? rows[0] : null;

  if (!invite) {
    return (
      <Shell variant="error" title="Link inválido" detail="Pedile uno nuevo al organizador." />
    );
  }
  if (invite.invite_used_at) {
    return (
      <Shell
        variant="info"
        title="Ya completaste tu alta"
        detail="Ingresá desde /login con tu celular y contraseña."
        ctaHref="/login"
        ctaLabel="Ir a iniciar sesión"
      />
    );
  }
  if (invite.invite_declined_at) {
    return (
      <Shell
        variant="info"
        title="Marcaste 'No voy'"
        detail="Si cambiás de opinión pedile al organizador que te genere un link nuevo."
      />
    );
  }
  if (new Date(invite.invite_expires_at).getTime() <= Date.now()) {
    return (
      <Shell
        variant="error"
        title="Link vencido"
        detail="Este link ya no es válido. Pedile uno nuevo al organizador."
      />
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-8 sm:py-12">
      <div className="space-y-6">
        <Link
          href={`/invite/${token}`}
          className="text-sm text-neutral-500 transition hover:text-neutral-700"
        >
          ← Volver
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Completá tus datos</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Te unís a <span className="font-medium">{invite.grupo_nombre}</span> ·{" "}
            {DIA_LABEL[invite.grupo_dia_semana]} {formatHora(invite.grupo_hora)} ·{" "}
            {invite.lugar_nombre}
          </p>
        </div>
        <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <SignupForm
            token={token}
            nombreTentativo={invite.invite_nombre_tentativo ?? ""}
            phone={invite.invite_phone}
          />
        </section>
        <p className="text-center text-xs text-neutral-500">
          Al crear tu cuenta aceptás que el organizador vea tu nombre y datos básicos. Tus ratings
          son privados y solo los ven admin y veedor.
        </p>
      </div>
    </main>
  );
}

function Shell({
  variant,
  title,
  detail,
  ctaHref,
  ctaLabel,
}: {
  variant: "error" | "info";
  title: string;
  detail: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  const palette =
    variant === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-emerald-200 bg-emerald-50 text-emerald-900";
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <div className={`rounded-lg border ${palette} p-6 text-center shadow-sm`}>
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="mt-2 text-sm">{detail}</p>
        {ctaHref && ctaLabel ? (
          <Link
            href={ctaHref}
            className="mt-4 inline-flex items-center rounded-md border border-current bg-white px-4 py-2 text-sm font-medium"
          >
            {ctaLabel}
          </Link>
        ) : null}
      </div>
    </main>
  );
}
