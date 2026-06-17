"use client";

import Link from "next/link";
import { useActionState } from "react";

import { BirthdateInput } from "@/components/birthdate-input";
import { ClubSelect } from "@/components/club-select";

import {
  activateExisting,
  type ActivateState,
  checkPhone,
  type CheckPhoneState,
  joinGroup,
  type JoinGroupState,
} from "./actions";

const labelClass = "block text-sm font-medium text-neutral-800";
const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

const ROLE_OPTIONS = [
  { value: "arquero", label: "Arquero" },
  { value: "jugador_campo", label: "Jugador de campo" },
  { value: "mixto", label: "Mixto" },
];

const POSITION_OPTIONS = [
  { value: "arquero", label: "Arquero" },
  { value: "defensor", label: "Defensor" },
  { value: "mediocampista", label: "Mediocampista" },
  { value: "delantero", label: "Delantero" },
];

const PIERNA_OPTIONS = [
  { value: "", label: "Prefiero no decir" },
  { value: "derecha", label: "Derecha" },
  { value: "izquierda", label: "Izquierda" },
  { value: "ambas", label: "Ambas" },
  { value: "ninguna", label: "Ninguna" },
];

function ErrorLine({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-red-700">{msg}</p>;
}

function FormError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <p
      role="alert"
      aria-live="polite"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      {msg}
    </p>
  );
}

function CambiarNumero() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="block w-full text-center text-xs text-neutral-500 underline"
    >
      Usar otro número
    </button>
  );
}

// ============================================================================
// Paso 1: pedir el celular. checkPhone decide el camino (nuevo|activar|login).
// ============================================================================
export function JoinForm({ token }: { token: string }) {
  const [check, checkAction, checking] = useActionState<CheckPhoneState, FormData>(
    checkPhone,
    null,
  );

  if (check && "ok" in check) {
    if (check.estado === "login") return <YaTenesCuenta />;
    if (check.estado === "activar")
      return <ActivarStep token={token} phone={check.phone} nombre={check.nombre} />;
    return <NuevoAltaForm token={token} phone={check.phone} />;
  }

  const error = check && "error" in check ? check.error : null;

  return (
    <form action={checkAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="phone" className={labelClass}>
          Celular
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          required
          placeholder="1155551234"
          className={`${inputClass} font-mono`}
        />
        <p className="mt-1 text-xs text-neutral-500">
          10 dígitos (sin 0 ni 15). Es el número con el que entrás a la app.
        </p>
      </div>

      <FormError msg={error} />

      <button
        type="submit"
        disabled={checking}
        className="w-full rounded-md bg-neutral-900 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {checking ? "Verificando…" : "Continuar"}
      </button>
    </form>
  );
}

// ============================================================================
// Camino 'login': ya tiene cuenta activa → a iniciar sesión.
// ============================================================================
function YaTenesCuenta() {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
        Ya tenés una cuenta con este celular. Entrá con tu celular y tu contraseña.
      </div>
      <Link
        href="/login"
        className="block w-full rounded-md bg-neutral-900 px-4 py-3 text-center text-base font-semibold text-white shadow-sm transition hover:bg-neutral-800"
      >
        Iniciar sesión
      </Link>
      <Link href="/recuperar" className="block text-center text-xs text-neutral-500 underline">
        Olvidé mi contraseña
      </Link>
      <CambiarNumero />
    </div>
  );
}

// ============================================================================
// Camino 'activar': existe pero nunca se logueó → solo crea su clave.
// ============================================================================
function ActivarStep({
  token,
  phone,
  nombre,
}: {
  token: string;
  phone: string;
  nombre: string | null;
}) {
  const [state, action, pending] = useActionState<ActivateState, FormData>(activateExisting, null);
  const fe = (f: string) =>
    state && "fieldErrors" in state ? (state.fieldErrors[f] ?? null) : null;
  const error = state && "error" in state ? state.error : null;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="phone" value={phone} />

      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
        {nombre ? <span className="font-semibold">¡Hola, {nombre}! </span> : null}
        Ya jugás con nosotros. Creá tu clave para entrar — tu historial queda intacto.
      </div>

      <div>
        <label htmlFor="password" className={labelClass}>
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
        <ErrorLine msg={fe("password")} />
      </div>
      <div>
        <label htmlFor="password_confirm" className={labelClass}>
          Repetir contraseña
        </label>
        <input
          id="password_confirm"
          name="password_confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
        <ErrorLine msg={fe("password_confirm")} />
      </div>

      <p className="text-xs text-neutral-500">
        Mínimo 8 caracteres. Guardala bien — la usás cada vez que entres a la app.
      </p>

      <FormError msg={error} />

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-neutral-900 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Activando…" : "Crear clave y entrar"}
      </button>

      <CambiarNumero />
    </form>
  );
}

// ============================================================================
// Camino 'nuevo': no está en la base → alta completa.
// ============================================================================
function NuevoAltaForm({ token, phone }: { token: string; phone: string }) {
  const [state, action, pending] = useActionState<JoinGroupState, FormData>(joinGroup, null);
  const fe = (f: string) =>
    state && "fieldErrors" in state ? (state.fieldErrors[f] ?? null) : null;
  const error = state && "error" in state ? state.error : null;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="phone" value={phone} />

      <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
        Te damos de alta con el celular <span className="font-mono">{phone}</span>. Completá tus
        datos.
      </div>

      <div>
        <label htmlFor="nombre" className={labelClass}>
          Nombre completo
        </label>
        <input
          id="nombre"
          name="nombre"
          type="text"
          required
          maxLength={80}
          className={inputClass}
        />
        <ErrorLine msg={fe("nombre")} />
      </div>

      <div>
        <label htmlFor="fecha_nacimiento" className={labelClass}>
          Fecha de nacimiento
        </label>
        <BirthdateInput id="fecha_nacimiento" required className={inputClass} />
        <ErrorLine msg={fe("fecha_nacimiento")} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="role_field" className={labelClass}>
            Rol
          </label>
          <select id="role_field" name="role_field" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Elegí…
            </option>
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ErrorLine msg={fe("role_field")} />
        </div>
        <div>
          <label htmlFor="position_pref" className={labelClass}>
            Posición preferida
          </label>
          <select
            id="position_pref"
            name="position_pref"
            required
            defaultValue=""
            className={inputClass}
          >
            <option value="" disabled>
              Elegí…
            </option>
            {POSITION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ErrorLine msg={fe("position_pref")} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className={labelClass}>
            Email <span className="text-neutral-500">(opcional)</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            maxLength={254}
            autoComplete="email"
            placeholder="vos@ejemplo.com"
            className={inputClass}
          />
          <ErrorLine msg={fe("email")} />
        </div>
        <div>
          <label htmlFor="pierna_habil" className={labelClass}>
            Pierna hábil <span className="text-neutral-500">(opcional)</span>
          </label>
          <select id="pierna_habil" name="pierna_habil" defaultValue="" className={inputClass}>
            {PIERNA_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ErrorLine msg={fe("pierna_habil")} />
        </div>
      </div>

      <div>
        <label htmlFor="club_id" className={labelClass}>
          Equipo del que sos hincha <span className="text-neutral-500">(opcional)</span>
        </label>
        <ClubSelect className={inputClass} />
        <ErrorLine msg={fe("club_id")} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="password" className={labelClass}>
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
          <ErrorLine msg={fe("password")} />
        </div>
        <div>
          <label htmlFor="password_confirm" className={labelClass}>
            Repetir contraseña
          </label>
          <input
            id="password_confirm"
            name="password_confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
          <ErrorLine msg={fe("password_confirm")} />
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        Mínimo 8 caracteres. Guardala bien — la usás cada vez que entres a la app.
      </p>

      <FormError msg={error} />

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-neutral-900 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Creando tu cuenta…" : "Crear cuenta y unirme al grupo"}
      </button>

      <CambiarNumero />
    </form>
  );
}
