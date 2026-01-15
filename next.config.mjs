/** @type {import('next').NextConfig} */
const UCP_WEB_BASE_URL =
  (process.env.UCP_WEB_BASE_URL || 'https://ucp-web-production-production.up.railway.app').replace(
    /\/$/,
    '',
  )

const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'm.media-amazon.com',
      },
      {
        protocol: 'https',
        hostname: 'cdn.shopify.com',
      },
      {
        protocol: 'https',
        hostname: 'static.wixstatic.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  // Enable compression
  compress: true,
  // Optimize production builds
  // Enable React strict mode
  productionBrowserSourceMaps: false,
  async rewrites() {
    return [
      {
        source: '/ucp/v1/:path*',
        destination: `${UCP_WEB_BASE_URL}/ucp/v1/:path*`,
      },
      {
        source: '/.well-known/ucp',
        destination: `${UCP_WEB_BASE_URL}/.well-known/ucp`,
      },
    ]
  },
};

export default nextConfig;
