import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Futbol de los martes",
  description: "Organizador de partidos con armado balanceado de equipos.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
