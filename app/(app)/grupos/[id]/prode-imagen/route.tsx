// Genera una imagen PNG de la tabla del Prode 🔮 de un grupo, lista para
// compartir por WhatsApp y picantear al grupo. Solo admin.
//
// Contenido NEUTRO/positivo: apodos + puntos (no expone ratings ni datos
// internos). next/og (Satori): los contenedores con >1 hijo deben tener
// display:flex.

import { ImageResponse } from "next/og";

import { requireRole } from "@/lib/auth/require-role";
import { playerLabel } from "@/lib/players/label";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 16; // tope para que la imagen no se vuelva gigante.

function medal(i: number): string {
  return i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  const { id } = await params;
  const supabase = await createClient();

  const year = new Date().getFullYear();

  const [{ data: grupo }, { data: tabla }] = await Promise.all([
    supabase.from("grupos").select("nombre").eq("id", id).maybeSingle(),
    supabase.rpc("get_prode_tabla", { p_grupo_id: id, p_year: year }),
  ]);

  const rows = (tabla ?? []).slice(0, MAX_ROWS);
  if (rows.length === 0) {
    return new Response("Todavía nadie sumó puntos en el Prode este año.", { status: 404 });
  }

  const grupoNombre = grupo?.nombre ?? "Pan y Queso";

  const INDIGO = "#4338ca";
  const INDIGO_BG = "#eef2ff";
  const INK = "#171717";
  const MUTED = "#525252";

  const headerH = 170;
  const footerH = 60;
  const rowH = 56;
  const height = headerH + footerH + rows.length * rowH + 40;

  const element = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: INDIGO_BG,
        padding: 40,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", marginBottom: 24 }}>
        <div style={{ display: "flex", fontSize: 46, fontWeight: 800, color: INDIGO }}>
          🔮 El Prode
        </div>
        <div style={{ display: "flex", fontSize: 28, fontWeight: 600, color: INK, marginTop: 4 }}>
          {grupoNombre} · Temporada {year}
        </div>
        <div style={{ display: "flex", fontSize: 20, color: MUTED, marginTop: 2 }}>
          3 pts si clavás el resultado · 1 pt si acertás quién gana
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          backgroundColor: "#ffffff",
          border: `2px solid ${INDIGO_BG}`,
          borderRadius: 16,
          padding: 16,
        }}
      >
        {rows.map((r, i) => (
          <div
            key={r.player_id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "8px 12px",
              backgroundColor: i % 2 === 0 ? "#ffffff" : "#fafafa",
              borderRadius: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                width: 56,
                fontSize: 30,
                fontWeight: 700,
                color: INDIGO,
              }}
            >
              {medal(i)}
            </div>
            <div style={{ display: "flex", flex: 1, fontSize: 30, color: INK }}>
              {playerLabel(r.nombre, r.apodo)}
            </div>
            <div style={{ display: "flex", fontSize: 22, color: MUTED, width: 120 }}>
              🎯 {r.aciertos_exactos}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                width: 130,
                fontSize: 32,
                fontWeight: 800,
                color: INDIGO,
              }}
            >
              {r.puntos} pts
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
        <div style={{ display: "flex", fontSize: 22, fontWeight: 600, color: INDIGO }}>
          ⚽ Pan y Queso
        </div>
      </div>
    </div>
  );

  try {
    const image = new ImageResponse(element, { width: 1000, height });
    const png = await image.arrayBuffer();
    return new Response(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    console.error("[prode-imagen/route] fallo generando la imagen:", err);
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return new Response(`Error generando la imagen — ${msg}`, { status: 500 });
  }
}
