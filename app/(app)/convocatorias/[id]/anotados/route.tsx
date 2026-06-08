// Genera una imagen PNG de los ANOTADOS de una convocatoria abierta, lista para
// pegar en el WhatsApp del grupo e incentivar que se cubran los lugares libres.
//
// Solo admin. Contenido NEUTRO: apodos + escudos + cuántos lugares faltan. No
// expone ratings ni datos sensibles. Es el "paso intermedio" mientras la gente
// se acostumbra a las notificaciones push: el admin ve que se bajó gente y, de
// un toque, comparte la lista con el llamado a anotarse.
//
// next/og (Satori): los contenedores con >1 hijo deben tener display:flex.

import { ImageResponse } from "next/og";
import { headers } from "next/headers";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Objetivo de banca de suplentes: igual que el push (SUPLENTES_OBJETIVO en
// lib/push/actions.ts). Si baja de esto, mostramos que buscamos suplentes.
const SUPLENTES_OBJETIVO = 3;

function fmtFecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

function fmtHora(h: string | null): string {
  if (!h) return "";
  return h.slice(0, 5);
}

type Anotado = { label: string; clubId: string | null; invitado: boolean };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data: conv } = await supabase
    .from("convocatorias")
    .select(
      "fecha, hora, cupo_maximo, grupo:grupos!grupo_id(nombre), lugar:lugares!lugar_id(nombre)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!conv) {
    return new Response("No se encontró la convocatoria.", { status: 404 });
  }

  const { data: rows } = await supabase
    .from("convocatoria_players")
    .select(
      "attendance_status, rol_en_convocatoria, orden_suplente, nombre_libre, player:players!player_id(nombre, apodo, club_id)",
    )
    .eq("convocatoria_id", id);

  const toAnotado = (r: NonNullable<typeof rows>[number]): Anotado => {
    const p = r.player;
    const apodo = (p?.apodo ?? "").trim();
    const nombre = (p?.nombre ?? "").trim();
    const libre = (r.nombre_libre ?? "").trim();
    return {
      label: apodo || nombre || libre || "—",
      clubId: p?.club_id ?? null,
      invitado: !p,
    };
  };

  const activos = (rows ?? []).filter((r) => r.attendance_status !== "declinado");
  const titulares = activos
    .filter((r) => r.rol_en_convocatoria === "titular")
    .map(toAnotado)
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
  const suplentes = activos
    .filter((r) => r.rol_en_convocatoria === "suplente")
    .sort((a, b) => (a.orden_suplente ?? 0) - (b.orden_suplente ?? 0))
    .map(toAnotado);

  const cupo = conv.cupo_maximo;
  const faltanTitulares = Math.max(0, cupo - titulares.length);
  const faltanSuplentes = Math.max(0, SUPLENTES_OBJETIVO - suplentes.length);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : "";
  const hostLabel = host || "panyqueso.ar";

  const grupoNombre = conv.grupo?.nombre ?? "Pan y Queso";
  const lugarNombre = conv.lugar?.nombre ?? "";
  const subtitulo = [fmtFecha(conv.fecha), fmtHora(conv.hora), lugarNombre]
    .filter(Boolean)
    .join("  ·  ");

  const EMERALD = "#047857";
  const EMERALD_BG = "#ecfdf5";
  const ORANGE = "#c2410c";
  const ORANGE_BG = "#fff7ed";
  const AMBER = "#b45309";
  const AMBER_BG = "#fffbeb";
  const INK = "#171717";
  const MUTED = "#525252";

  // Banner principal: qué falta. Titular tiene prioridad sobre suplente.
  let banner: { text: string; color: string; bg: string; border: string };
  if (faltanTitulares > 0) {
    banner = {
      text: `⚠️ Faltan ${faltanTitulares} ${faltanTitulares === 1 ? "jugador" : "jugadores"} — ¡anotate!`,
      color: ORANGE,
      bg: ORANGE_BG,
      border: "#fed7aa",
    };
  } else if (faltanSuplentes > 0) {
    banner = {
      text: "🪑 Buscamos suplentes — ¡sumate a la banca!",
      color: AMBER,
      bg: AMBER_BG,
      border: "#fde68a",
    };
  } else {
    banner = {
      text: "✅ ¡Lista completa! Gracias por anotarse.",
      color: EMERALD,
      bg: EMERALD_BG,
      border: "#a7f3d0",
    };
  }
  const hayVacante = faltanTitulares > 0 || faltanSuplentes > 0;

  // Alto dinámico para no cortar listas largas (2 columnas por sección).
  const PAD = 40;
  const ROW_H = 44;
  const titRows = Math.max(1, Math.ceil(titulares.length / 2));
  const supRows = Math.max(1, Math.ceil(Math.max(suplentes.length, 1) / 2));
  const height = Math.min(
    1500,
    PAD * 2 + 150 + 80 + (44 + titRows * ROW_H) + (44 + supRows * ROW_H) + (hayVacante ? 64 : 24),
  );

  function PlayerChip({ a }: { a: Anotado }) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "48%",
          padding: "6px 0",
        }}
      >
        {a.clubId && origin ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${origin}/clubs/${a.clubId}.png`} width={28} height={28} alt="" />
        ) : (
          <div style={{ display: "flex", width: 28, height: 28 }} />
        )}
        <div style={{ display: "flex", fontSize: 24, color: INK }}>
          {a.label}
          {a.invitado ? " (inv.)" : ""}
        </div>
      </div>
    );
  }

  function Section({
    title,
    color,
    players,
    empty,
  }: {
    title: string;
    color: string;
    players: Anotado[];
    empty: string;
  }) {
    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color, marginBottom: 6 }}>
          {title}
        </div>
        {players.length === 0 ? (
          <div style={{ display: "flex", fontSize: 22, color: MUTED }}>{empty}</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", width: "100%" }}>
            {players.map((a, i) => (
              <PlayerChip key={i} a={a} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: EMERALD_BG,
          padding: PAD,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 18 }}>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 800, color: EMERALD }}>
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

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontSize: 30,
            fontWeight: 800,
            color: banner.color,
            backgroundColor: banner.bg,
            border: `2px solid ${banner.border}`,
            borderRadius: 14,
            padding: "14px 20px",
            marginBottom: 20,
          }}
        >
          {banner.text}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, flex: 1 }}>
          <Section
            title={`✅ Anotados (${titulares.length}/${cupo})`}
            color={EMERALD}
            players={titulares}
            empty="Sin anotados todavía."
          />
          <Section
            title={`🪑 Suplentes (${suplentes.length})`}
            color={AMBER}
            players={suplentes}
            empty="Sin suplentes."
          />
        </div>

        {hayVacante ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              fontSize: 24,
              fontWeight: 700,
              color: EMERALD,
              marginTop: 14,
            }}
          >
            📲 Entrá a {hostLabel} y anotate
          </div>
        ) : null}
      </div>
    ),
    { width: 1000, height },
  );
}
