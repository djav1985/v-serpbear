/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',

  // Performance optimizations
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },

  // Next 16 builds with Turbopack by default (`next build` / `next dev`).
  turbopack: {
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
  },

  // Image optimization
  images: {
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384]
  },

  async headers() {
    const privatePageHeaders = [{ key: 'Cache-Control', value: 'private, max-age=60, must-revalidate' }];
    const noStoreHeaders = [{ key: 'Cache-Control', value: 'no-store' }];
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: https://image.thum.io https://www.google.com",
          "connect-src 'self' https://image.thum.io",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
        ].join('; '),
      },
    ];
    return [
      // Keep MCP protocol and OAuth responses' application headers aligned with the reference server.
      { source: '/((?!\\.well-known/oauth-protected-resource|\\.well-known/oauth-authorization-server|api/oauth(?:/|$)|api/mcp(?:/|$)).*)', headers: securityHeaders },
      { source: '/login', headers: noStoreHeaders },
      { source: '/domains', headers: privatePageHeaders },
      { source: '/research', headers: privatePageHeaders },
      { source: '/domain/:path*', headers: privatePageHeaders },
    ];
  },
};

module.exports = nextConfig;
