// FUT: mínimo de convocados para poder armar equipos.
//
// Antes era un 10 fijo, que bloqueaba a los grupos chicos. Ahora el mínimo es el
// tamaño del grupo (la convocatoria hereda ese cupo), con un piso de 4 (2v2)
// para que el armado tenga sentido. Una convocatoria suelta (sin grupo) usa el
// piso de 4.
export const PISO_CONVOCADOS = 4;

export function minConvocadosParaGenerar(
  grupoId: string | null,
  cupoMaximo: number | null | undefined,
): number {
  if (!grupoId) return PISO_CONVOCADOS;
  return Math.max(PISO_CONVOCADOS, cupoMaximo ?? PISO_CONVOCADOS);
}
