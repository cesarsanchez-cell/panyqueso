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
      // PNG en los tamaños que Android necesita para el ícono de inicio.
      { src: "/app-icon/192", type: "image/png", sizes: "192x192", purpose: "any" },
      { src: "/app-icon/512", type: "image/png", sizes: "512x512", purpose: "any" },
      { src: "/app-icon/512", type: "image/png", sizes: "512x512", purpose: "maskable" },
      // SVG como fallback escalable (lo usan algunos navegadores de escritorio).
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any", purpose: "any" },
    ],
  };
}
