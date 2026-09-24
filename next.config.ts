import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' }
];

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      // Legal-document PDFs are embedded in an <iframe> on the public supplier page;
      // DENY (from the global rule above) would block that same-origin embed.
      { source: '/api/files/:path*', headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
    ];
  }
};

export default nextConfig;
