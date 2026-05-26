// ============================================================================
// Telefonos AR centralizado.
//
// El producto opera solo con celulares argentinos. El usuario tipea el numero
// como lo usa todos los dias (con o sin 0, con o sin 9, con espacios o
// guiones). Internamente almacenamos en E.164 movil AR: +549<10 digitos>,
// porque es lo que espera Supabase Auth y lo que se mete en el email
// sintetico (<+549...>@phone.fdlm.local).
//
// Reglas de parseo:
//  - Quitamos todo lo no-digito (espacios, guiones, parentesis, '+').
//  - Si arranca con "54", lo sacamos.
//  - Si arranca con "9", lo sacamos.
//  - Si arranca con "0", lo sacamos (formato local "011-1234-5678").
//  - Lo que queda tiene que ser exactamente 10 digitos (codigo area + numero).
//  - Storage: "+549" + esos 10 digitos.
//
// Si en el futuro se opera con otros paises, este helper es el unico lugar a
// tocar (y los inputs que asumen 10 digitos).
// ============================================================================

const E164_AR_MOVIL_RE = /^\+549\d{10}$/;

export function parseArPhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;

  // Saca prefijo de pais.
  if (digits.startsWith("54")) digits = digits.slice(2);
  // Saca el '9' de movil AR.
  if (digits.startsWith("9")) digits = digits.slice(1);
  // Saca el cero del formato local de discado.
  if (digits.startsWith("0")) digits = digits.slice(1);

  if (digits.length !== 10) return null;

  return `+549${digits}`;
}

export function isValidArPhone(raw: string | null | undefined): boolean {
  return parseArPhone(raw) !== null;
}

// Devuelve los 10 digitos locales (codigo de area + numero) desde un E.164.
// Para mostrarle al usuario sin el +549. Si el storage tiene un formato viejo
// inesperado, devolvemos el input sin el "+" como mejor esfuerzo.
export function arLocalFromE164(e164: string | null | undefined): string {
  if (!e164) return "";
  if (E164_AR_MOVIL_RE.test(e164)) return e164.slice(4); // saca "+549"
  return e164.replace(/^\+/, "");
}

// Formato visual: 11 5555-1234 (CABA/GBA 4-2-4) o 351 555-1234 (interior 3-3-4).
// Pensado para mostrar en cards y listas, no para inputs.
export function formatArLocal(e164: string | null | undefined): string {
  const local = arLocalFromE164(e164);
  if (local.length !== 10) return local;
  // CABA/GBA tiene codigo de area de 2 digitos (11), resto del pais tiene 3 o 4.
  // Como no tenemos esa info aca, asumimos 2 digitos solo si arranca con "11".
  if (local.startsWith("11")) {
    return `${local.slice(0, 2)} ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return `${local.slice(0, 3)} ${local.slice(3, 6)}-${local.slice(6)}`;
}
