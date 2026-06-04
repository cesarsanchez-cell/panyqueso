// Avatar reutilizable del jugador (foto o iniciales como fallback).
// Presentational, sin estado: server component. La foto sale de players.avatar_url
// (o de la vista players_public para el lado del jugador).

type Size = "sm" | "md" | "lg";

const SIZE_CLASS: Record<Size, string> = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm",
};

function initials(nombre: string): string {
  return (
    nombre
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function PlayerAvatar({
  url,
  nombre,
  size = "sm",
}: {
  url: string | null;
  nombre: string;
  size?: Size;
}) {
  return (
    <div
      className={`${SIZE_CLASS[size]} shrink-0 overflow-hidden rounded-full bg-neutral-100 ring-1 ring-neutral-200`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-semibold text-neutral-400">
          {initials(nombre)}
        </div>
      )}
    </div>
  );
}
