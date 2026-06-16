import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.resumepilot.ai' },
      { protocol: 'https', hostname: 's3.**.amazonaws.com' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },
  typedRoutes: false,
  serverExternalPackages: [],
};

export default nextConfig;
