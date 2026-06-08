import type { MetadataRoute } from "next";

// Manifest de la PWA: permite "agregar a la pantalla de inicio" y, en iOS,
// habilita las notificaciones push (solo funcionan con la app instalada).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pan y Queso",
    short_name: "Pan y Queso",
    description: "Organizá los partidos y armá equipos parejos.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ecfdf5",
    theme_color: "#047857",
    lang: "es-AR",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any", purpose: "any" },
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any", purpose: "maskable" },
    ],
  };
}
