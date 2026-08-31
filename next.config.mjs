import path from "path";
import { fileURLToPath } from "url";

import { IMAGE_REMOTE_HOSTS } from "./src/lib/imageRemoteHosts.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function stablePivotaServiceBase(value, fallback) {
  const normalized = String(value || '').trim().replace(/\/$/, '');
  if (!normalized) return fallback;
  try {
    const host = new URL(normalized).hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === 'pivota.cc' || host.endsWith('.pivota.cc')) {
      return normalized;
    }
  } catch {
    // Use the known-good gateway default below.
  }
  return fallback;
}

/** @type {import('next').NextConfig} */
const UCP_WEB_BASE_URL = stablePivotaServiceBase(
  process.env.UCP_WEB_BASE_URL,
  'https://gateway.pivota.cc',
)
// UCP identity cleanup (2026-07-23): /.well-known/ucp now serves the safety-kernel
// profile from the GATEWAY (merchant_of_record:false, commerce_index_passthrough —
// the mid-man identity), not the legacy ucp-web creator lane, which was the one
// surface that ever declared Pivota merchant-of-record.
//
// 2026-08-26: the ucp-web default was `ucp-web-production-production.up.railway.app`,
// which died with the Railway decommission (2026-08-25). Prod already overrides
// UCP_WEB_BASE_URL to the gateway — verified live: /ucp/v1/* answers from the gateway
// (x-service-commit e128a2d58c47), not Railway — so the default now names the gateway
// instead of a host that no longer resolves. Retiring the creator lane's session
// RUNTIME (order page) remains a separate decision; this only fixes the fallback.
const UCP_DISCOVERY_BASE_URL = stablePivotaServiceBase(
  process.env.UCP_DISCOVERY_BASE_URL,
  'https://gateway.pivota.cc',
)
const REVIEWS_UPSTREAM_BASE_URL = (
  process.env.NEXT_PUBLIC_REVIEWS_API_URL ||
  process.env.NEXT_PUBLIC_REVIEWS_BACKEND_URL ||
  process.env.REVIEWS_BACKEND_URL ||
  'https://api.pivota.cc'
).replace(/\/$/, '')

function hostnameFromUrl(url) {
  try {
    return new URL(String(url || '')).hostname || '';
  } catch {
    return '';
  }
}

const REVIEWS_UPSTREAM_HOSTNAME = hostnameFromUrl(REVIEWS_UPSTREAM_BASE_URL);

// Derived from the shared host list so `next.config` and `src/lib/displayImage.ts`
// can never disagree about which hosts the optimizer accepts. See
// `src/lib/imageRemoteHosts.mjs` for why that drift matters.
const IMAGE_REMOTE_PATTERNS = [
  ...IMAGE_REMOTE_HOSTS.map((hostname) => ({ protocol: 'https', hostname })),
  // Env-configured and therefore not statically known to the client-side helper.
  // Its default (api.pivota.cc) is already in the shared list;
  // an override that is not simply gets proxied instead of optimized, which still renders.
  ...(REVIEWS_UPSTREAM_HOSTNAME && !IMAGE_REMOTE_HOSTS.includes(REVIEWS_UPSTREAM_HOSTNAME)
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
  // NOTE: deliberately NO static Cache-Control header for /products/* here.
  // A next.config header is stamped on EVERY response for the path — including
  // degraded renders (the static route's 500 and the alias route's uncached
  // shell) — so `public, s-maxage=...` would tell the CDN to cache a degraded
  // response for an hour even though Next itself stored nothing. The
  // /products/[id] route is static/ISR (revalidate + generateStaticParams), so
  // Next emits the correct Cache-Control per render outcome: s-maxage from
  // `revalidate` on healthy cached renders, private/no-store on dynamic
  // bail-outs (degraded shells, personalized alias renders).
  async rewrites() {
    return {
      // beforeFiles: must win over the filesystem match on /products/[id].
      // That route is static/ISR and can never read searchParams (a
      // dynamic-API touch during on-demand static generation is a hard 500) —
      // so merchant-personalized requests are routed to the force-dynamic
      // /products/m/[id] alias route. The visible URL stays /products/:id and
      // the query string is passed through.
      //
      // ACCEPTED OVER-BREADTH: `:id` matches ANY single-segment child of
      // /products, so a sibling route like /products/indexability?merchant_id=x
      // would also be captured and render as a (not-found) PDP. Nothing emits
      // merchant_id on those URLs, and a tighter id-shape match is
      // impractical — path-to-regexp rejects nested alternation groups in a
      // :param(...) pattern (see the removed headers() note in git history).
      // If a new single-segment /products/* route ever legitimately takes a
      // merchant_id query, it needs its own preceding beforeFiles self-rewrite.
      beforeFiles: [
        {
          source: '/products/:id',
          has: [{ type: 'query', key: 'merchant_id' }],
          destination: '/products/m/:id',
        },
      ],
      afterFiles: [
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
          destination: `${UCP_DISCOVERY_BASE_URL}/.well-known/ucp`,
        },
        {
          source: '/ucp/capabilities',
          destination: `${UCP_DISCOVERY_BASE_URL}/ucp/capabilities`,
        },
      ],
    }
  },
};

export default nextConfig;
