import { ImageResponse } from "next/og";

// Ícono para iOS (apple-touch-icon) generado con next/og: pelota ⚽ sobre verde.
// Evita tener que producir un PNG binario a mano. Next lo sirve en /apple-icon
// y le inyecta el <link rel="apple-touch-icon"> solo.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          fontSize: 120,
        }}
      >
        ⚽
      </div>
    ),
    size,
  );
}
