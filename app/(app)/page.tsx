import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/require-role";

type CardLink = {
  href: string;
  title: string;
  description: string;
  roles: Array<"admin" | "veedor" | "player" | "coordinador">;
};

const CARDS: CardLink[] = [
  {
    href: "/jugadores",
    title: "Jugadores",
    description: "Listado, alta y propuestas de cambio. Admin crea solicitudes; veedor aprueba.",
    roles: ["admin", "veedor", "coordinador"],
  },
  {
    href: "/convocatorias",
    title: "Convocatorias",
    description: "Armado de partidos: convocados, draft de teams, confirmación y resultado.",
    roles: ["admin", "veedor", "coordinador"],
  },
  {
    href: "/auditoria",
    title: "Auditoría",
    description: "Cola de solicitudes pendientes de revisión. Aprobar, rechazar o flag.",
    roles: ["veedor"],
  },
  {
    href: "/grupos",
    title: "Grupos",
    description:
      "Grupos recurrentes (lugar/día/hora) con titulares y lista de espera FIFO persistente.",
    roles: ["admin", "coordinador"],
  },
  {
    href: "/lugares",
    title: "Lugares",
    description: "Canchas / sedes donde se juegan los partidos.",
    roles: ["admin"],
  },
  {
    href: "/veedores",
    title: "Veedores",
    description: "Otorgar o quitar el rango de veedor (revisa cambios de rating). Rango global.",
    roles: ["admin"],
  },
  {
    href: "/configuracion",
    title: "Configuración",
    description: "Auditoría del veedor on/off y otros ajustes del grupo.",
    roles: ["admin"],
  },
  {
    href: "/perfil",
    title: "Perfil",
    description: "Cambio de password.",
    roles: ["admin", "veedor"],
  },
];

export default async function HomePage() {
  const { profile } = await requireUser();
  const role = profile.role;

  // Player no tiene cards admin/veedor. Lo mandamos a /mi-perfil que es su
  // home natural (Fase 9 PR 8).
  if (role === "player") {
    redirect("/mi-perfil");
  }

  const cards = CARDS.filter((c) => role && c.roles.includes(role));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          Hola{profile.nombre ? `, ${profile.nombre}` : ""}.
        </h1>
        <p className="text-base text-neutral-600">
          Estás logueado como <span className="font-medium">{role ?? "—"}</span>.
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Accesos rápidos
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {cards.map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
                className="block rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:shadow-md"
              >
                <p className="text-sm font-semibold text-neutral-900">{c.title}</p>
                <p className="mt-1 text-xs text-neutral-600">{c.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
