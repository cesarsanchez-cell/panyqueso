import Link from "next/link";

import { LoginForm } from "./login-form";

type SearchParams = Promise<{ redirectTo?: string; recovery_error?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { redirectTo, recovery_error } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Pan y Queso</h1>
        <p className="text-sm text-neutral-600">Ingresá con tu cuenta para continuar.</p>
      </div>

      {recovery_error ? (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          El link de recuperación venció o ya fue usado. Pedí uno nuevo.
        </p>
      ) : null}

      <LoginForm redirectTo={redirectTo} />

      <p className="text-center text-xs text-neutral-500">
        <Link href="/recuperar" className="underline">
          Olvidé mi contraseña
        </Link>
      </p>
    </div>
  );
}
