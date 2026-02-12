/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/signal',
        destination: process.env.NEXT_PUBLIC_SIGNALING_URL || 'http://localhost:3001',
      },
    ];
  },
};

module.exports = nextConfig;
