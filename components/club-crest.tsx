"use client";

import { useState } from "react";

import { clubCrestSrc, getClub } from "@/lib/clubs";

// Escudo del club favorito al lado del nombre. Intenta cargar el asset local
// /public/clubs/<id>.png; si todavía no existe (los escudos se suman de a
// poco), cae a un fallback con las iniciales del club. Si club_id es null o
// desconocido, no renderiza nada.
export function ClubCrest({
  clubId,
  size = 18,
  className = "",
}: {
  clubId: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  const club = getClub(clubId);
  if (!club) return null;

  const dim = { width: size, height: size };

  if (errored) {
    const initials = club.nombre
      .replace(/[()]/g, "")
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
    return (
      <span
        title={club.nombre}
        aria-label={club.nombre}
        style={dim}
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[8px] font-bold text-neutral-600 ${className}`}
      >
        {initials}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- ícono pequeño estático; next/image es innecesario y complica el fallback onError.
    <img
      src={clubCrestSrc(club.id)}
      alt={club.nombre}
      title={club.nombre}
      width={size}
      height={size}
      style={dim}
      onError={() => setErrored(true)}
      className={`inline-block shrink-0 object-contain ${className}`}
    />
  );
}
