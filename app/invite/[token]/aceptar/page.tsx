import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

export default async function AceptarInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await createClient();
  const { data: rows } = await supabase.rpc("get_invite_by_token", { p_token: token });
  const invite = rows && rows.length > 0 ? rows[0] : null;

  return (
    <main className="mx-auto max-w-md px-4 py-8 sm:py-12">
      <div className="space-y-5">
        <Link
          href={`/invite/${token}`}
          className="text-sm text-neutral-500 transition hover:text-neutral-700"
        >
          ← Volver
        </Link>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h1 className="text-lg font-bold text-amber-900">Signup todavía no disponible</h1>
          <p className="mt-2 text-sm text-amber-900">
            Estamos terminando esta pantalla. Por ahora, avisale por WhatsApp al organizador que
            podés ir.
          </p>
          {invite ? (
            <p className="mt-3 text-xs text-amber-800">
              Te invitaron al grupo <span className="font-medium">{invite.grupo_nombre}</span>.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
