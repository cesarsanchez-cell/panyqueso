// ============================================================================
// FUT-89: catálogo estático de clubes para el "equipo favorito" del jugador.
//
// Lista curada (no hay tabla en DB): el jugador guarda solo el `id` (slug) en
// players.club_id. El escudo es un asset local en /public/clubs/<id>.png; si
// falta, <ClubCrest> cae a un fallback con las iniciales (ver components).
//
// `grupo` agrupa el selector: clubes de Argentina (Primera División) y los más
// famosos del mundo. "Ninguno" no está acá: se representa con club_id = null.
// ============================================================================

export type ClubGroup = "Argentina" | "Mundo";

export type Club = {
  id: string;
  nombre: string;
  grupo: ClubGroup;
};

export const CLUBS: readonly Club[] = [
  // --- Primera División Argentina --------------------------------------------
  { id: "all-boys", nombre: "All Boys", grupo: "Argentina" },
  { id: "argentinos", nombre: "Argentinos Juniors", grupo: "Argentina" },
  { id: "atletico-tucuman", nombre: "Atlético Tucumán", grupo: "Argentina" },
  { id: "banfield", nombre: "Banfield", grupo: "Argentina" },
  { id: "barracas-central", nombre: "Barracas Central", grupo: "Argentina" },
  { id: "belgrano", nombre: "Belgrano", grupo: "Argentina" },
  { id: "boca", nombre: "Boca Juniors", grupo: "Argentina" },
  { id: "central-cordoba", nombre: "Central Córdoba (SdE)", grupo: "Argentina" },
  { id: "chacarita", nombre: "Chacarita Juniors", grupo: "Argentina" },
  { id: "defensa-y-justicia", nombre: "Defensa y Justicia", grupo: "Argentina" },
  { id: "riestra", nombre: "Deportivo Riestra", grupo: "Argentina" },
  { id: "estudiantes", nombre: "Estudiantes (LP)", grupo: "Argentina" },
  { id: "gimnasia", nombre: "Gimnasia (LP)", grupo: "Argentina" },
  { id: "godoy-cruz", nombre: "Godoy Cruz", grupo: "Argentina" },
  { id: "huracan", nombre: "Huracán", grupo: "Argentina" },
  { id: "independiente", nombre: "Independiente", grupo: "Argentina" },
  { id: "independiente-rivadavia", nombre: "Independiente Rivadavia", grupo: "Argentina" },
  { id: "instituto", nombre: "Instituto", grupo: "Argentina" },
  { id: "lanus", nombre: "Lanús", grupo: "Argentina" },
  { id: "newells", nombre: "Newell's Old Boys", grupo: "Argentina" },
  { id: "nueva-chicago", nombre: "Nueva Chicago", grupo: "Argentina" },
  { id: "platense", nombre: "Platense", grupo: "Argentina" },
  { id: "racing", nombre: "Racing Club", grupo: "Argentina" },
  { id: "river", nombre: "River Plate", grupo: "Argentina" },
  { id: "rosario-central", nombre: "Rosario Central", grupo: "Argentina" },
  { id: "san-lorenzo", nombre: "San Lorenzo", grupo: "Argentina" },
  { id: "sarmiento", nombre: "Sarmiento (J)", grupo: "Argentina" },
  { id: "talleres", nombre: "Talleres (C)", grupo: "Argentina" },
  { id: "tigre", nombre: "Tigre", grupo: "Argentina" },
  { id: "union", nombre: "Unión (SF)", grupo: "Argentina" },
  { id: "velez", nombre: "Vélez Sarsfield", grupo: "Argentina" },

  // --- 20 clubes top del mundo -----------------------------------------------
  { id: "real-madrid", nombre: "Real Madrid", grupo: "Mundo" },
  { id: "barcelona", nombre: "Barcelona", grupo: "Mundo" },
  { id: "atletico-madrid", nombre: "Atlético de Madrid", grupo: "Mundo" },
  { id: "man-city", nombre: "Manchester City", grupo: "Mundo" },
  { id: "man-united", nombre: "Manchester United", grupo: "Mundo" },
  { id: "liverpool", nombre: "Liverpool", grupo: "Mundo" },
  { id: "arsenal", nombre: "Arsenal", grupo: "Mundo" },
  { id: "chelsea", nombre: "Chelsea", grupo: "Mundo" },
  { id: "tottenham", nombre: "Tottenham", grupo: "Mundo" },
  { id: "bayern", nombre: "Bayern München", grupo: "Mundo" },
  { id: "dortmund", nombre: "Borussia Dortmund", grupo: "Mundo" },
  { id: "psg", nombre: "Paris Saint-Germain", grupo: "Mundo" },
  { id: "juventus", nombre: "Juventus", grupo: "Mundo" },
  { id: "milan", nombre: "AC Milan", grupo: "Mundo" },
  { id: "inter", nombre: "Inter de Milán", grupo: "Mundo" },
  { id: "napoli", nombre: "Napoli", grupo: "Mundo" },
  { id: "benfica", nombre: "Benfica", grupo: "Mundo" },
  { id: "porto", nombre: "Porto", grupo: "Mundo" },
  { id: "ajax", nombre: "Ajax", grupo: "Mundo" },
  { id: "flamengo", nombre: "Flamengo", grupo: "Mundo" },
] as const;

const CLUBS_BY_ID = new Map(CLUBS.map((c) => [c.id, c]));

export function getClub(id: string | null | undefined): Club | null {
  if (!id) return null;
  return CLUBS_BY_ID.get(id) ?? null;
}

export function isValidClubId(id: string | null | undefined): boolean {
  return !!id && CLUBS_BY_ID.has(id);
}

// Ruta del escudo como asset local. Si el archivo no existe, <ClubCrest> cae
// al fallback con iniciales.
export function clubCrestSrc(id: string): string {
  return `/clubs/${id}.png`;
}

// Para selectores agrupados (Argentina primero, después Mundo).
export const CLUBS_BY_GROUP: { grupo: ClubGroup; clubs: Club[] }[] = [
  { grupo: "Argentina", clubs: CLUBS.filter((c) => c.grupo === "Argentina") },
  { grupo: "Mundo", clubs: CLUBS.filter((c) => c.grupo === "Mundo") },
];
