import { ImageResponse } from "next/og";

// Íconos PNG de la PWA generados con next/og (pelota ⚽ sobre verde), en los
// tamaños que pide Android para el ícono de la pantalla de inicio (192 y 512).
// Evita tener que producir PNGs binarios a mano. El manifest los referencia.
// El emoji ocupa ~60% para dejar margen y servir también como icono maskable.
export const runtime = "nodejs";

const SIZES: Record<string, number> = { "192": 192, "512": 512 };

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const px = SIZES[size];
  if (!px) return new Response("Not found", { status: 404 });

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: "#047857",
          fontSize: Math.round(px * 0.6),
        }}
      >
        ⚽
      </div>
    ),
    {
      width: px,
      height: px,
      headers: { "Cache-Control": "public, max-age=86400, immutable" },
    },
  );
}
