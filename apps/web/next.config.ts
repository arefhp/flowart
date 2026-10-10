import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

const config: NextConfig = {
  // The whole site is a static export served by the Worker's static assets (spec section 1).
  output: 'export',
  images: { unoptimized: true },
  transpilePackages: ['@flowart/shared'],
  // Local development only: Next on :3000 proxies /api/* to `wrangler dev` on :8787, so the
  // browser sees one origin. The key is absent from production builds (rewrites cannot be
  // used with output: 'export').
  ...(isDev
    ? {
        async rewrites() {
          return [{ source: '/api/:path*', destination: `${process.env.DEV_API_ORIGIN ?? 'http://localhost:8787'}/api/:path*` }];
        },
      }
    : {}),
};

export default config;
