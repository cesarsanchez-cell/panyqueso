// Insignias / logros del jugador (FUT-78).
//
// Se DERIVAN automaticamente del historial de partidos (no las asigna nadie:
// cero friccion, cero estado nuevo en la DB). La fuente son los numeros que ya
// expone get_my_match_history: victorias, goles y veces figura.
//
// Todas las insignias son POSITIVAS (CLAUDE.md): celebran logros, nunca
// exponen rating interno ni datos sensibles. Cada "familia" (figura / goleador
// / ganador) devuelve a lo sumo UNA insignia: el nivel mas alto alcanzado.

export type PlayerBadge = {
  // id estable por familia (figura/goleador/ganador), util como key de React.
  id: "figura" | "goleador" | "ganador";
  emoji: string;
  title: string;
  // Texto chico bajo el titulo (ej. "12 goles", "3 veces").
  detail: string;
};

export type BadgeStats = {
  ganados: number;
  goles: number;
  figuras: number;
};

function goles(n: number): string {
  return n === 1 ? "1 gol" : `${n} goles`;
}

function veces(n: number): string {
  return n === 1 ? "1 vez" : `${n} veces`;
}

function victorias(n: number): string {
  return n === 1 ? "1 victoria" : `${n} victorias`;
}

/**
 * Calcula las insignias ganadas a partir de los acumulados del jugador.
 * Devuelve solo las ganadas (no hay insignias "bloqueadas" en el MVP).
 */
export function computeBadges(stats: BadgeStats): PlayerBadge[] {
  const badges: PlayerBadge[] = [];

  // ⭐ Figura del partido (engancha con FUT-77).
  if (stats.figuras >= 1) {
    badges.push({
      id: "figura",
      emoji: "⭐",
      title: "Figura del partido",
      detail: veces(stats.figuras),
    });
  }

  // ⚽ Goleador: nivel mas alto alcanzado.
  if (stats.goles >= 25) {
    badges.push({ id: "goleador", emoji: "🔥", title: "Artillero", detail: goles(stats.goles) });
  } else if (stats.goles >= 10) {
    badges.push({ id: "goleador", emoji: "🎯", title: "Goleador", detail: goles(stats.goles) });
  } else if (stats.goles >= 1) {
    badges.push({ id: "goleador", emoji: "⚽", title: "Primer gol", detail: goles(stats.goles) });
  }

  // 🏆 Ganador: nivel mas alto alcanzado.
  if (stats.ganados >= 25) {
    badges.push({
      id: "ganador",
      emoji: "🏆",
      title: "Ganador imparable",
      detail: victorias(stats.ganados),
    });
  } else if (stats.ganados >= 10) {
    badges.push({
      id: "ganador",
      emoji: "🏆",
      title: "Ganador",
      detail: victorias(stats.ganados),
    });
  }

  return badges;
}
