import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { ResetPasswordForm } from "./reset-password-form";

// Esta pagina exige sesion (la setea /auth/callback al canjear el code del
// mail). Si el usuario llega sin sesion, lo mandamos al recuperar para que
// pida un nuevo link.
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/recuperar");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Nueva contraseña</h1>
        <p className="text-sm text-neutral-600">Elegí una contraseña nueva para tu cuenta.</p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
