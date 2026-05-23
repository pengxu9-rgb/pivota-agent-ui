import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const UCP_WEB_BASE_URL =
  (process.env.UCP_WEB_BASE_URL || 'https://ucp-web-production-production.up.railway.app').replace(
    /\/$/,
    '',
  )
const REVIEWS_UPSTREAM_BASE_URL = (
  process.env.NEXT_PUBLIC_REVIEWS_API_URL ||
  process.env.NEXT_PUBLIC_REVIEWS_BACKEND_URL ||
  process.env.REVIEWS_BACKEND_URL ||
  'https://web-production-fedb.up.railway.app'
).replace(/\/$/, '')

function hostnameFromUrl(url) {
  try {
    return new URL(String(url || '')).hostname || '';
  } catch {
    return '';
  }
}

const REVIEWS_UPSTREAM_HOSTNAME = hostnameFromUrl(REVIEWS_UPSTREAM_BASE_URL);

const IMAGE_REMOTE_PATTERNS = [
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
    hostname: 'sdcdn.io',
  },
  {
    protocol: 'https',
    hostname: 'assets.sdcdn.io',
  },
  {
    protocol: 'https',
    hostname: 'drjart.com',
  },
  {
    protocol: 'https',
    hostname: 'www.drjart.com',
  },
  {
    protocol: 'https',
    hostname: 'guerlain.com',
  },
  {
    protocol: 'https',
    hostname: 'www.guerlain.com',
  },
  {
    protocol: 'https',
    hostname: 'static.wixstatic.com',
  },
  {
    protocol: 'https',
    hostname: 'images.unsplash.com',
  },
  // Review media is signed and served by backend public host.
  {
    protocol: 'https',
    hostname: 'web-production-fedb.up.railway.app',
  },
  {
    protocol: 'https',
    hostname: 'pivota-agent-production.up.railway.app',
  },
  ...(REVIEWS_UPSTREAM_HOSTNAME
    ? [
        {
          protocol: 'https',
          hostname: REVIEWS_UPSTREAM_HOSTNAME,
        },
      ]
    : []),
];

const HTML_LIMITED_BOTS =
  /GPTBot|ClaudeBot|anthropic-ai|Google-Extended|PerplexityBot|cohere-ai|Googlebot|[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|Baiduspider|yandex|YandexBot|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|FacebookBot|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight/i;

const nextConfig = {
  reactStrictMode: true,
  htmlLimitedBots: HTML_LIMITED_BOTS,
  // Avoid Next.js picking an incorrect monorepo root (can slow builds and break output tracing).
  outputFileTracingRoot: __dirname,
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  images: {
    remotePatterns: IMAGE_REMOTE_PATTERNS,
    minimumCacheTTL: 2678400,
    formats: ['image/avif', 'image/webp'],
  },
  // Enable compression
  compress: true,
  // Optimize production builds
  // Enable React strict mode
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: '/products/:id(sig_[^/]+)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=3600, stale-while-revalidate=86400',
          },
        ],
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/agent/shop/v1/review-media/:path*',
        destination: `${REVIEWS_UPSTREAM_BASE_URL}/agent/shop/v1/review-media/:path*`,
      },
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
