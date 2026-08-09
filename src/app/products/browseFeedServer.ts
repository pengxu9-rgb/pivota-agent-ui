/**
 * Server-side browse feed for the /products RSC page.
 *
 * WHY THIS EXISTS (2026-08-08 agent-readability audit): /products was a
 * client-only page, so the prerendered HTML — the bytes every crawler and
 * no-JS agent reads — was the empty state ("The browse feed is empty right
 * now") for every user-agent, while the sitemap advertises /products at
 * priority 0.9 and robots.ts explicitly allows GPTBot/ClaudeBot/
 * Google-Extended onto it. The catalog's internal-link graph was therefore
 * empty: PDP discovery was 100% sitemap-dependent and no link equity flowed.
 *
 * Mechanics mirror the PDP server fetch (pdpServerPage.tsx) exactly: post to
 * this deployment's OWN `/api/gateway` proxy (resolveServerBaseUrl + the same
 * path), because the proxy injects the upstream API key — get_discovery_feed
 * 401s without it, and the key lives in the deployment env the proxy owns, not
 * anywhere this module should re-source. The gateway call is a POST and Next's
 * fetch Data Cache only caches GET, so `next.revalidate` on the fetch would
 * silently cache nothing; unstable_cache around the call is the working pattern
 * (same reason getPdpV2Cached uses it).
 *
 * Empty/failed results are deliberately NOT cached (same rule as
 * pdp_empty_payload_not_cached): caching an empty grid would pin the exact
 * defect this file removes for a full revalidation window. On the very first
 * build-time prerender the origin may not answer yet — that degrades to the
 * pre-existing client-only shell and self-heals on the first revalidation.
 */
import { unstable_cache } from 'next/cache';
import { getShoppingDiscoveryFeed, type ProductResponse } from '@/lib/api';

export const BROWSE_FEED_REVALIDATE_S = 900;
// Matches the client's first-page budget (GRID_INITIAL_PAGE_SIZE) so the
// server-rendered grid and the hydrated refresh agree about page shape.
const BROWSE_FEED_LIMIT = 24;
const BROWSE_FEED_TIMEOUT_MS = 12000;

// DELIBERATELY UNLIKE pdpServerPage's copy: VERCEL_URL is NOT preferred.
// VERCEL_URL is always set during a Vercel build and points at the deployment
// being built, which cannot answer its own requests — and on previews it is
// behind Deployment Protection, so the fetch 401s. The PDP is immune because
// `generateStaticParams: []` means it never fetches at build time at all; this
// page is a static route with no dynamic segment, so it does. Prefer the stable
// public origin, and keep VERCEL_URL only as a last resort for environments
// where nothing else is configured.
function resolveServerBaseUrl(): string {
  const explicit = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\//.test(explicit)) return explicit;
  const publicOrigin = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\//.test(publicOrigin)) return publicOrigin;
  if (process.env.VERCEL_ENV === 'production' || !process.env.VERCEL_URL) {
    return 'https://agent.pivota.cc';
  }
  return `https://${String(process.env.VERCEL_URL).trim().replace(/\/+$/, '')}`;
}

// A Vercel/Next production BUILD cannot fetch the deployment it is building.
// Attempting it wasted the full 12s budget and then shipped the empty grid —
// the exact defect this module exists to remove — so the build deliberately
// renders the client-only shell and lets the first ISR revalidation (on a live
// server) fill the real grid.
function isProductionBuildPhase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build';
}

async function fetchBrowseFeedOnce(): Promise<ProductResponse[]> {
  const result = await getShoppingDiscoveryFeed({
    surface: 'browse_products',
    limit: BROWSE_FEED_LIMIT,
    timeout_ms: BROWSE_FEED_TIMEOUT_MS,
    // Public browse must stay stable and personalization-free — same rule the
    // client grid follows.
    recentViews: [],
    recentQueries: [],
    // This deployment's own proxy, which injects the upstream API key.
    gatewayBaseUrl: `${resolveServerBaseUrl()}/api/gateway`,
  });
  return result.products;
}

const getBrowseFeedCached = unstable_cache(
  async (): Promise<ProductResponse[]> => {
    // Retry on BOTH failure modes. get_discovery_feed cold-fills (measured: the
    // first request after a cold window returns [], the next returns the full
    // page) AND the call itself is slow enough to be flaky — 6.7s and 10.3s
    // measured against a 12s budget. The first cut retried only on an empty
    // result, so the dominant failure (throw/timeout) got no retry at all.
    let products: ProductResponse[] = [];
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        products = await fetchBrowseFeedOnce();
      } catch (err) {
        lastError = err;
        continue;
      }
      if (products.length) return products;
    }
    // Never cache an empty grid, and never let a failed refresh overwrite a
    // good page: throwing is what makes Next keep the last healthy render
    // (same contract as the PDP's PDP_DEGRADED_RENDER_ERROR). Returning [] here
    // instead — as the first cut did — rendered a 200 empty grid that Next
    // stored as the route's ISR entry, pinning the defect for a full window and
    // replacing a good page on every failed revalidation.
    throw new Error(
      `browse_feed_unavailable_not_cached${lastError ? `: ${String(lastError)}` : ''}`,
    );
  },
  ['browse-feed-v1'],
  { revalidate: BROWSE_FEED_REVALIDATE_S, tags: ['browse'] },
);

export async function fetchBrowseFeedForServerRender(): Promise<ProductResponse[]> {
  // Build phase: do not fetch (the origin is not live yet). Render the
  // client-only shell; the first revalidation on a live server fills it.
  if (isProductionBuildPhase()) return [];
  return await getBrowseFeedCached();
}
