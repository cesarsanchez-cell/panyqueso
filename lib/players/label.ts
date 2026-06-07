// Etiqueta de jugador: en el grupo de amigos nadie se llama por el nombre, asi
// que mostramos el APODO. Si no hay apodo cargado, caemos al nombre real. El
// nombre real solo se ve completo en el formulario de edicion de la ficha.
//
// Ej: playerLabel("Lionel Messi", "Pulga") -> "Pulga"
//     playerLabel("Juan Perez", null)      -> "Juan Perez"
export function playerLabel(
  nombre: string | null | undefined,
  apodo: string | null | undefined,
): string {
  const a = (apodo ?? "").trim();
  if (a) return a;
  return (nombre ?? "").trim() || "—";
}
