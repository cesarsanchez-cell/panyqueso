/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Subida de fotos: el default de Server Actions es 1 MB y una foto de celu
    // pesa varios MB -> Next la rechazaba antes de correr la validacion. La
    // action valida hasta 8 MB; dejamos margen arriba.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
