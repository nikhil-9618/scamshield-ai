/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Dev-only allowlist for the cloud preview hostname; supplied at runtime so no
  // environment-specific host is written into the repository.
  allowedDevOrigins: process.env.NEXT_DEV_ALLOWED_ORIGINS
    ? process.env.NEXT_DEV_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : undefined,
  transpilePackages: ['@scamshield/shared-types', '@scamshield/validation'],
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '6mb',
    },
  },
  async headers() {
    const rawApi = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
    const apiOrigin = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawApi) ? rawApi : `https://${rawApi}`;
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              `connect-src 'self' ${apiOrigin}`,
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
