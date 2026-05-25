import { RecuperarForm } from "./recuperar-form";

export default function RecuperarPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Recuperar contraseña</h1>
        <p className="text-sm text-neutral-600">
          Te mandamos un link al email para que la cambies.
        </p>
      </div>
      <RecuperarForm />
    </div>
  );
}
