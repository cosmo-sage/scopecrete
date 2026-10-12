import type { NextConfig } from 'next';

// No service worker: next-pwa was a webpack plugin and the Turbopack build
// never ran it (DECISIONS §8), so it was removed.
const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  turbopack: {},
};

export default nextConfig;
