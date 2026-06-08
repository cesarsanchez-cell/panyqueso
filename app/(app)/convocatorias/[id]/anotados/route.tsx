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
// La imagen depende del roster en vivo: nunca cachear (ni el navegador ni el CDN).
export const dynamic = "force-dynamic";

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

  // Banner principal: qué falta. Titular tiene prioridad sobre la lista de espera.
  let banner: { text: string; color: string; bg: string; border: string };
  if (faltanTitulares > 0) {
    banner = {
      text: `⚠️ Hay ${faltanTitulares} ${faltanTitulares === 1 ? "lugar" : "lugares"} en titulares — ¡sumate!`,
      color: ORANGE,
      bg: ORANGE_BG,
      border: "#fed7aa",
    };
  } else if (faltanSuplentes > 0) {
    banner = {
      text: "🪑 Hay lugar en la lista de espera — ¡sumate!",
      color: AMBER,
      bg: AMBER_BG,
      border: "#fde68a",
    };
  } else {
    banner = {
      text: "✅ ¡Lista completa! Gracias por sumarse.",
      color: EMERALD,
      bg: EMERALD_BG,
      border: "#a7f3d0",
    };
  }
  const hayVacante = faltanTitulares > 0 || faltanSuplentes > 0;

  // Slots numerados: titulares hasta el cupo (los que faltan salen "Libre" con
  // su número, ej. 10/11/12), lista de espera hasta el objetivo de banca.
  const titSlots: (Anotado | null)[] = Array.from(
    { length: Math.max(cupo, titulares.length) },
    (_, i) => titulares[i] ?? null,
  );
  const supSlots: (Anotado | null)[] = Array.from(
    { length: Math.max(SUPLENTES_OBJETIVO, suplentes.length) },
    (_, i) => suplentes[i] ?? null,
  );

  // Alto dinámico para no cortar listas largas (2 columnas por sección).
  const PAD = 40;
  const ROW_H = 44;
  const titRows = Math.max(1, Math.ceil(titSlots.length / 2));
  const supRows = Math.max(1, Math.ceil(supSlots.length / 2));
  const height = Math.min(
    1500,
    PAD * 2 + 150 + 80 + (44 + titRows * ROW_H) + (44 + supRows * ROW_H) + (hayVacante ? 64 : 24),
  );

  function SlotChip({ n, a }: { n: number; a: Anotado | null }) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "48%",
          padding: "6px 0",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            width: 38,
            fontSize: 24,
            fontWeight: 700,
            color: a ? EMERALD : "#a3a3a3",
          }}
        >
          {n}.
        </div>
        {a && a.clubId && origin ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${origin}/clubs/${a.clubId}.png`} width={28} height={28} alt="" />
        ) : (
          <div style={{ display: "flex", width: 28, height: 28 }} />
        )}
        <div
          style={{
            display: "flex",
            fontSize: 24,
            color: a ? INK : "#a3a3a3",
          }}
        >
          {a ? `${a.label}${a.invitado ? " (inv.)" : ""}` : "Libre"}
        </div>
      </div>
    );
  }

  function Section({
    title,
    color,
    slots,
  }: {
    title: string;
    color: string;
    slots: (Anotado | null)[];
  }) {
    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color, marginBottom: 6 }}>
          {title}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", width: "100%" }}>
          {slots.map((a, i) => (
            <SlotChip key={i} n={i + 1} a={a} />
          ))}
        </div>
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
            title={`✅ Titulares (${titulares.length}/${cupo})`}
            color={EMERALD}
            slots={titSlots}
          />
          <Section
            title={`🪑 Lista de espera (${suplentes.length})`}
            color={AMBER}
            slots={supSlots}
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
            📲 Entrá a {hostLabel} y sumate
          </div>
        ) : null}
      </div>
    ),
    {
      width: 1000,
      height,
      headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
    },
  );
}
