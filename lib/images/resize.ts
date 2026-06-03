// Redimensiona y comprime una imagen EN EL CLIENTE antes de subirla.
//
// Las fotos de celular pesan varios MB; tanto Next (bodySizeLimit) como Vercel
// (~4.5 MB por request a la función) las rechazan. Achicándolas a ~1024px y
// re-encodeando a JPEG, el archivo queda en cientos de KB: entra siempre y el
// avatar carga más rápido. Respeta la orientación EXIF (fotos de cel salen
// derechas). Si no se puede decodificar, devuelve el archivo original.
export async function resizeImage(file: File, maxDim = 1024, quality = 0.85): Promise<File> {
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }

  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) return file;

  return new File([blob], "foto.jpg", { type: "image/jpeg" });
}
