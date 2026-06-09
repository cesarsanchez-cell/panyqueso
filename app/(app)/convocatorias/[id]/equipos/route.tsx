// Genera una imagen PNG de los equipos confirmados, lista para compartir por
// WhatsApp (la imagen se ve inline en el chat; un PDF entraria como adjunto).
//
// Solo admin. Contenido NEUTRO: apodos + escudos + sello de balance. No expone
// numeros/ratings: el balance se reduce a un enum cualitativo (parejos / quien
// viene abajo), igual que en la vista del jugador. El umbral (2%) matchea el
// del RPC get_my_confirmed_match_teams.
//
// next/og (Satori): los contenedores con >1 hijo deben tener display:flex.

import { ImageResponse } from "next/og";
import { headers } from "next/headers";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
// La imagen depende del partido en vivo: nunca cachear (ni el navegador ni el CDN).
export const dynamic = "force-dynamic";

const BALANCE_PAREJOS_PCT = 0.02; // mismo umbral que el RPC.

function fmtFecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

function fmtHora(h: string | null): string {
  if (!h) return "";
  return h.slice(0, 5);
}

function label(nombre: string | null, apodo: string | null): string {
  const a = (apodo ?? "").trim();
  if (a) return a;
  return (nombre ?? "").trim() || "—";
}

type TeamPlayer = { label: string; isGoalkeeper: boolean; clubId: string | null };

// Carga los escudos como data URLs (base64) ANTES de renderizar. Así Satori no
// hace un fetch remoto por cada <img> durante el render: si un escudo falla
// (slug viejo sin PNG, 404, timeout de red) lo salteamos en vez de tirar abajo
// toda la imagen con un 500.
async function loadCrests(origin: string, clubIds: string[]): Promise<Map<string, string>> {
  const crests = new Map<string, string>();
  if (!origin) return crests;
  await Promise.all(
    [...new Set(clubIds)].map(async (clubId) => {
      try {
        const res = await fetch(`${origin}/clubs/${clubId}.png`, { cache: "force-cache" });
        if (!res.ok) return;
        const buf = Buffer.from(await res.arrayBuffer());
        crests.set(clubId, `data:image/png;base64,${buf.toString("base64")}`);
      } catch {
        // Escudo opcional: el jugador va sin escudo, la imagen igual se genera.
      }
    }),
  );
  return crests;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data: conv } = await supabase
    .from("convocatorias")
    .select("fecha, hora, grupo:grupos!grupo_id(nombre), lugar:lugares!lugar_id(nombre)")
    .eq("id", id)
    .maybeSingle();

  const { data: match } = await supabase
    .from("matches")
    .select(
      `teams:match_teams!match_id(
         team_label, total_score,
         players:match_team_players!match_team_id(
           is_goalkeeper,
           player:players!player_id(nombre, apodo, club_id)
         )
       )`,
    )
    .eq("convocatoria_id", id)
    .maybeSingle();

  if (!conv || !match?.teams?.length) {
    return new Response("No hay un partido confirmado para esta convocatoria.", { status: 404 });
  }

  const teams = [...match.teams].sort((a, b) => a.team_label.localeCompare(b.team_label));
  const teamA = teams.find((t) => t.team_label === "A") ?? teams[0];
  const teamB = teams.find((t) => t.team_label === "B") ?? teams[1];

  const toPlayers = (t: typeof teamA): TeamPlayer[] =>
    (t?.players ?? [])
      .flatMap((mtp) => {
        const p = mtp.player;
        if (!p) return [];
        return [
          {
            label: label(p.nombre, p.apodo),
            isGoalkeeper: mtp.is_goalkeeper,
            clubId: p.club_id ?? null,
          },
        ];
      })
      .sort(
        (a, b) =>
          Number(b.isGoalkeeper) - Number(a.isGoalkeeper) || a.label.localeCompare(b.label, "es"),
      );

  const playersA = toPlayers(teamA);
  const playersB = toPlayers(teamB);

  // Balance neutro desde total_score (mismo criterio que el RPC del jugador).
  const scoreA = Number(teamA?.total_score ?? 0);
  const scoreB = Number(teamB?.total_score ?? 0);
  const sum = scoreA + scoreB;
  let underdog: "A" | "B" | null = null;
  if (sum > 0 && Math.abs(scoreA - scoreB) / (sum / 2) > BALANCE_PAREJOS_PCT) {
    underdog = scoreA < scoreB ? "A" : "B";
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "";

  const crests = await loadCrests(
    origin,
    [...playersA, ...playersB].flatMap((p) => (p.clubId ? [p.clubId] : [])),
  );

  const grupoNombre = conv.grupo?.nombre ?? "Pan y Queso";
  const lugarNombre = conv.lugar?.nombre ?? "";
  const subtitulo = [fmtFecha(conv.fecha), fmtHora(conv.hora), lugarNombre]
    .filter(Boolean)
    .join("  ·  ");

  const EMERALD = "#047857";
  const EMERALD_BG = "#ecfdf5";
  const ORANGE = "#c2410c";
  const ORANGE_BG = "#fff7ed";
  const INK = "#171717";
  const MUTED = "#525252";

  function Column({ teamLabel, players }: { teamLabel: "A" | "B"; players: TeamPlayer[] }) {
    const isUnderdog = underdog === teamLabel;
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          backgroundColor: "#ffffff",
          border: `2px solid ${EMERALD_BG}`,
          borderRadius: 16,
          padding: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: EMERALD }}>
            Equipo {teamLabel}
          </div>
          {isUnderdog ? (
            <div
              style={{
                display: "flex",
                fontSize: 18,
                fontWeight: 700,
                color: ORANGE,
                backgroundColor: ORANGE_BG,
                border: `1px solid #fed7aa`,
                borderRadius: 999,
                padding: "4px 12px",
              }}
            >
              💪 ¡a darlo vuelta!
            </div>
          ) : null}
        </div>
        {players.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                width: 40,
                fontSize: 26,
                fontWeight: 700,
                color: EMERALD,
              }}
            >
              {i + 1}.
            </div>
            {p.clubId && crests.has(p.clubId) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={crests.get(p.clubId)} width={28} height={28} alt="" />
            ) : (
              <div style={{ display: "flex", width: 28, height: 28 }} />
            )}
            <div style={{ display: "flex", fontSize: 26, color: INK }}>
              {p.isGoalkeeper ? "🧤 " : ""}
              {p.label}
            </div>
          </div>
        ))}
      </div>
    );
  }

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
      <div style={{ display: "flex", flexDirection: "column", marginBottom: 24 }}>
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

      <div style={{ display: "flex", gap: 24, flex: 1 }}>
        <Column teamLabel="A" players={playersA} />
        <Column teamLabel="B" players={playersB} />
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
        {underdog ? (
          <div style={{ display: "flex", fontSize: 24, fontWeight: 600, color: ORANGE }}>
            💪 Equipo {underdog} viene un toque abajo — ¡a darlo vuelta!
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 24, fontWeight: 600, color: EMERALD }}>
            ⚖️ Equipos parejos
          </div>
        )}
      </div>
    </div>
  );

  // next/og renderiza la imagen de forma perezosa MIENTRAS se transmite la
  // respuesta, así que un error de Satori salta DESPUÉS de retornar y Next lo
  // convierte en un 500 opaco. Forzamos el render acá (arrayBuffer) para poder
  // capturar la causa real y mostrarla en vez del genérico "Reintentá".
  try {
    const image = new ImageResponse(element, { width: 1000, height: 760 });
    const png = await image.arrayBuffer();
    return new Response(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    console.error("[equipos/route] fallo generando la imagen:", err);
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return new Response(`Error generando la imagen — ${msg}`, { status: 500 });
  }
}
