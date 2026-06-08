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
          <div style={{ fontSize: 30, fontWeight: 700, color: EMERALD }}>Equipo {teamLabel}</div>
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
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
            {p.clubId && origin ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`${origin}/clubs/${p.clubId}.png`} width={28} height={28} alt="" />
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

  return new ImageResponse(
    (
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
    ),
    { width: 1000, height: 760 },
  );
}
