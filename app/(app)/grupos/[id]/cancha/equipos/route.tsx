// PNG de los equipos armados en cancha (modo presentismo), listo para WhatsApp.
// Lee el snapshot presentismo_armado (no match_teams: el "que cuente" es A4).
// Contenido neutro: solo nombres (sin scores). Soporta 2 o 3 equipos + suplentes.
//
// next/og (Satori): todo contenedor con >1 hijo debe tener display:flex.

import { ImageResponse } from "next/og";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import type { PresentismoArmado } from "@/lib/teams/presentismo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmtFecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

const EMERALD = "#047857";
const EMERALD_BG = "#ecfdf5";
const AMBER = "#b45309";
const INK = "#171717";
const MUTED = "#525252";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin", "coordinador"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data: conv } = await supabase
    .from("convocatorias")
    .select(
      "fecha, presentismo_armado, grupo:grupos!grupo_id(nombre), lugar:lugares!lugar_id(nombre)",
    )
    .eq("grupo_id", id)
    .eq("modo", "presentismo")
    .eq("status", "abierta")
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();

  const armado = (conv?.presentismo_armado ?? null) as unknown as PresentismoArmado | null;
  if (!conv || !armado || armado.teams.length === 0) {
    return new Response("Todavía no hay equipos armados en esta cancha.", { status: 404 });
  }

  const grupoNombre = conv.grupo?.nombre ?? "Pan y Queso";
  const lugarNombre = conv.lugar?.nombre ?? "";
  const subtitulo = [fmtFecha(conv.fecha), lugarNombre].filter(Boolean).join("  ·  ");

  function Column({ team }: { team: PresentismoArmado["teams"][number] }) {
    const titulares = [
      ...(team.goalkeeper ? [{ ...team.goalkeeper, isGk: true }] : []),
      ...team.players.map((p) => ({ ...p, isGk: false })),
    ];
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          backgroundColor: "#ffffff",
          border: `2px solid ${EMERALD_BG}`,
          borderRadius: 16,
          padding: 22,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 30,
            fontWeight: 700,
            color: EMERALD,
            marginBottom: 12,
          }}
        >
          Equipo {team.label}
        </div>
        {titulares.map((p, i) => (
          <div
            key={p.id}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                width: 36,
                fontSize: 24,
                fontWeight: 700,
                color: EMERALD,
              }}
            >
              {i + 1}.
            </div>
            <div style={{ display: "flex", fontSize: 25, color: INK }}>
              {p.isGk ? "🧤 " : ""}
              {p.nombre}
              {p.esProbador ? " ·prob" : ""}
            </div>
          </div>
        ))}
        {team.bench.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 12,
              borderTop: "1px solid #e5e5e5",
              paddingTop: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 18,
                fontWeight: 600,
                color: AMBER,
                marginBottom: 4,
              }}
            >
              Suplentes
            </div>
            {team.bench.map((p) => (
              <div
                key={p.id}
                style={{ display: "flex", fontSize: 22, color: MUTED, padding: "3px 0" }}
              >
                {p.nombre}
                {p.esProbador ? " ·prob" : ""}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const numTeams = armado.teams.length;
  const width = numTeams >= 3 ? 1320 : 1000;

  const element = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: EMERALD_BG,
        padding: 40,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", marginBottom: 22 }}>
        <div style={{ display: "flex", fontSize: 42, fontWeight: 800, color: EMERALD }}>
          ⚽ Pan y Queso
        </div>
        <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: INK, marginTop: 4 }}>
          {grupoNombre}
        </div>
        {subtitulo ? (
          <div style={{ display: "flex", fontSize: 22, color: MUTED, marginTop: 2 }}>
            {subtitulo}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 20, flex: 1 }}>
        {armado.teams.map((t) => (
          <Column key={t.label} team={t} />
        ))}
      </div>
    </div>
  );

  try {
    const image = new ImageResponse(element, { width, height: 780 });
    const png = await image.arrayBuffer();
    return new Response(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    console.error("[cancha/equipos/route] fallo generando la imagen:", err);
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return new Response(`Error generando la imagen — ${msg}`, { status: 500 });
  }
}
