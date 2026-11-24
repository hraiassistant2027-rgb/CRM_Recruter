import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Резюме до 20 МБ завантажуються через серверні дії
  experimental: { serverActions: { bodySizeLimit: '21mb' }, middlewareClientMaxBodySize: '21mb' },
  // Бібліотеки читання PDF/DOCX працюють лише на сервері, не збираємо їх у пакет
  serverExternalPackages: ['mammoth', 'unpdf'],
  async headers() {
    return [
      // Файли резюме показуються у вбудованому вікні поруч із карткою — лише на нашому ж сайті
      { source: '/((?!api/documents/).*)', headers: securityHeaders },
      {
        source: '/api/documents/:path*',
        headers: [
          ...securityHeaders.filter((h) => h.key !== 'X-Frame-Options' && h.key !== 'Content-Security-Policy'),
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
    ];
  },
};

export default nextConfig;
