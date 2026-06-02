// Etiqueta de jugador para listas: alias primero, nombre despues. El alias
// ayuda a identificar mas rapido al jugador. Si no hay alias (o coincide con el
// nombre), se muestra solo el nombre.
//
// Ej: playerLabel("Lionel Messi", "Pulga") -> "Pulga · Lionel Messi"
//     playerLabel("Juan Perez", null)      -> "Juan Perez"
export function playerLabel(
  nombre: string | null | undefined,
  apodo: string | null | undefined,
): string {
  const n = (nombre ?? "").trim() || "—";
  const a = (apodo ?? "").trim();
  if (a && a !== n) return `${a} · ${n}`;
  return n;
}
