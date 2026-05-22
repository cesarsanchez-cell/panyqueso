// Layout aislado para pantallas de autenticacion (login, futuro reset).
// Sin nav ni shell de app: centrado, minimo.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
