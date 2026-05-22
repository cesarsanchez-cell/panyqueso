import { LoginForm } from "./login-form";

type SearchParams = Promise<{ redirectTo?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { redirectTo } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Futbol de los martes</h1>
        <p className="text-sm text-neutral-600">Ingresá con tu cuenta para continuar.</p>
      </div>
      <LoginForm redirectTo={redirectTo} />
    </div>
  );
}
