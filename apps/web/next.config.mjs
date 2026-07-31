/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared package ships TypeScript-compiled CJS; transpiling it here keeps
  // the workspace link working without a separate build step in dev.
  transpilePackages: ['@bb/shared'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
    // Avatars render at a handful of fixed sizes; listing them keeps Next from
    // generating and caching variants nothing ever requests.
    imageSizes: [32, 44, 64, 96, 128],
    formats: ['image/avif', 'image/webp'],
    // Cloudinary URLs are content-addressed by version, so a long browser cache
    // is safe — a changed avatar is a different URL.
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  experimental: {
    /*
      Rewrites barrel imports to deep paths at build time, so pulling one symbol
      out of these packages does not drag the whole index into the bundle.
    */
    optimizePackageImports: ['@tanstack/react-query', 'sonner', 'recharts', '@bb/shared'],
  },
  // Standalone output keeps the production image to the runtime files only, but
  // it builds the tree with symlinks — which Windows refuses without Developer
  // Mode. Opt in from the Dockerfile so local Windows builds still work.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
