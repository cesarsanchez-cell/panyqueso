import Link from "next/link";

import { LoginForm } from "./login-form";

type SearchParams = Promise<{ redirectTo?: string; recovery_error?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { redirectTo, recovery_error } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3">
        <div
          aria-hidden
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-3xl shadow-sm"
        >
          ⚽
        </div>
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Pan y Queso</h1>
          <p className="text-sm font-medium text-emerald-700">
            El fútbol con amigos, ordenado y divertido.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 text-center shadow-sm">
        <p className="text-sm text-neutral-600">
          Convocá los partidos, armá{" "}
          <span className="font-medium text-neutral-900">equipos parejos</span> al toque y seguí
          todo en un solo lugar.
        </p>
        <ul className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
          <li className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 ring-1 ring-emerald-100">
            📋 Convocatorias
          </li>
          <li className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 ring-1 ring-emerald-100">
            ⚖️ Equipos parejos
          </li>
          <li className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 ring-1 ring-emerald-100">
            📊 Estadísticas
          </li>
          <li className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 ring-1 ring-emerald-100">
            🔮 Prode y premios
          </li>
        </ul>
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

      <p className="text-center text-sm text-neutral-600">Ingresá con tu cuenta para continuar.</p>

      <LoginForm redirectTo={redirectTo} />

      <p className="text-center text-xs text-neutral-500">
        <Link href="/recuperar" className="underline">
          Olvidé mi contraseña
        </Link>
      </p>
    </div>
  );
}
