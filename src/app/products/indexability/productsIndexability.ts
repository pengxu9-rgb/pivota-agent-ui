import { headers } from 'next/headers';
import {
  SITEMAP_SEED_PRODUCT_IDS,
  isProductIdSitemapEligible,
} from '../../sitemap-seeds';

/**
 * Server-only helpers for the /products/indexability listing surface.
 *
 * Why this surface exists (per pivota-pdp-indexing-discoverability runbook):
 *   - Sitemap-driven discovery is one signal Google / Gemini grounding use
 *     to find canonical PDPs. Internal-link discovery is another, weighted
 *     somewhat differently. Crawlers that arrive on agent.pivota.cc via any
 *     path should be able to follow `<a>` tags into every canonical PDP.
 *   - This page is the formal internal-link surface: paginated, SSR'd, no
 *     client JS, same-origin links to /products/sig_*.
 *   - It is NOT a user-facing browse experience — it's purely a machine-
 *     discoverability backstop. Real users use /products with the full
 *     interactive shopping UI.
 */

export const INDEXABILITY_PAGE_SIZE = 50;
export const INDEXABILITY_HARD_PAGE_LIMIT = 200;
// Bumped from 8s → 12s. Vercel SSR self-fetch through the same-origin
// `/api/gateway` proxy adds non-trivial latency (round-trip out → CDN
// → upstream → back). The first crawler hit per cache window pays this;
// subsequent hits in the same window are served from Next.js's fetch
// cache (see `INDEXABILITY_REVALIDATE_S`).
export const INDEXABILITY_FETCH_TIMEOUT_MS = 12000;
// How long Next.js caches a single page-of-products fetch. Crawlers
// can hit this surface 100s of times a day; without caching every hit
// would scan the registry SQL — see PR #280 incident for what
// uncontrolled backend load does to /health.
export const INDEXABILITY_REVALIDATE_S = 3600;

export interface IndexabilityProduct {
  product_entity_id: string;
  title: string;
  brand: string;
  category: string;
  canonical_url: string;
  image_url: string;
  updated_at: string | null;
}

export interface IndexabilityPageData {
  page: number;
  pageSize: number;
  totalPages: number | null; // null when total isn't known
  products: IndexabilityProduct[];
  hasMore: boolean;
  errorMessage: string | null;
  // True when the products list came from the static seed fallback
  // (registry fetch failed). Crawlers still get a usable internal-link
  // surface; ops can spot this in HTML to know the registry is degraded.
  source: 'registry' | 'seeds';
}

function resolveServerBaseUrl(headerList: Headers): string {
  const host = headerList.get('x-forwarded-host') || headerList.get('host') || '';
  const proto =
    headerList.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (host) return `${proto}://${host}`;
  return 'https://agent.pivota.cc';
}

function safeString(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.trim();
}

function normalizeProduct(raw: any): IndexabilityProduct | null {
  const sig =
    safeString(raw?.product_entity_id) ||
    safeString(raw?.product_group_id) ||
    safeString(raw?.sellable_item_group_id);
  if (!sig.startsWith('sig_')) return null;
  return {
    product_entity_id: sig,
    title: safeString(raw?.title) || safeString(raw?.name) || sig,
    brand: safeString(raw?.brand) || safeString(raw?.brand_name),
    category: safeString(raw?.category) || safeString(raw?.product_type),
    canonical_url: safeString(raw?.canonical_url) || safeString(raw?.destination_url),
    image_url: safeString(raw?.image_url),
    updated_at: safeString(raw?.updated_at) || null,
  };
}

/**
 * Fetch a single page of canonical PDPs from the registry feed.
 * Server-only. Returns deterministic fallback data on error so the
 * page itself never throws — crawlers expect HTML, not 5xx.
 */
export async function fetchIndexabilityPage(
  page: number,
): Promise<IndexabilityPageData> {
  const safePage = Math.max(1, Math.min(INDEXABILITY_HARD_PAGE_LIMIT, Math.floor(page)));
  const headerList = await headers();
  const baseUrl = resolveServerBaseUrl(headerList);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), INDEXABILITY_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/gateway`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Use Next.js's fetch cache (per-request URL + body) so repeated
      // crawler hits in the same revalidate window don't re-scan the
      // registry. `cache: 'no-store'` (the previous setting) overrode
      // the page-level revalidate and forced backend hits on every
      // request — exactly the kind of LLM/DB-multiplication risk
      // covered in feedback_llm_call_multipliers.md.
      next: { revalidate: INDEXABILITY_REVALIDATE_S, tags: ['indexability'] },
      signal: controller.signal,
      body: JSON.stringify({
        operation: 'get_product_entity_index_feed',
        payload: {
          page: safePage,
          limit: INDEXABILITY_PAGE_SIZE,
        },
      }),
    });

    if (!res.ok) {
      return _seedFallback(
        safePage,
        `Registry feed responded with HTTP ${res.status}`,
      );
    }

    const data = await res.json().catch(() => null);
    const rawProducts = Array.isArray(data?.products) ? data.products : [];
    const products = rawProducts
      .map(normalizeProduct)
      .filter((p: IndexabilityProduct | null): p is IndexabilityProduct => p !== null);

    // Empty registry response — fall back to seeds so crawlers always
    // have at least the canonical baselines to follow.
    if (products.length === 0) {
      return _seedFallback(safePage, 'Registry feed returned no products');
    }

    // The feed reports a `total` count when available; fall back to a
    // best-effort hasMore signal based on whether we filled the page.
    const totalRaw = data?.total ?? data?.total_count ?? data?.pagination?.total;
    const total = typeof totalRaw === 'number' && Number.isFinite(totalRaw) ? totalRaw : null;
    const totalPages = total !== null ? Math.max(1, Math.ceil(total / INDEXABILITY_PAGE_SIZE)) : null;
    const hasMore =
      totalPages !== null
        ? safePage < totalPages
        : products.length >= INDEXABILITY_PAGE_SIZE;

    return {
      page: safePage,
      pageSize: INDEXABILITY_PAGE_SIZE,
      totalPages,
      products,
      hasMore,
      errorMessage: null,
      source: 'registry',
    };
  } catch (err) {
    return _seedFallback(
      safePage,
      err instanceof Error ? `Registry fetch failed: ${err.message}` : 'Registry fetch failed.',
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * When the registry feed fails or returns nothing, fall back to the
 * static seed list so crawlers still get a usable internal-link surface
 * (see ../sitemap-seeds.ts). Same content as `/sitemap-products.xml` —
 * canonical baselines guaranteed to work even if everything else is
 * down. Page > 1 returns empty (seeds fit on one page).
 */
function _seedFallback(page: number, errorMessage: string): IndexabilityPageData {
  if (page > 1) {
    return {
      page,
      pageSize: INDEXABILITY_PAGE_SIZE,
      totalPages: 1,
      products: [],
      hasMore: false,
      errorMessage,
      source: 'seeds',
    };
  }
  const seedProducts: IndexabilityProduct[] = SITEMAP_SEED_PRODUCT_IDS.filter(
    isProductIdSitemapEligible,
  ).map((sig) => ({
    product_entity_id: sig,
    title: '(canonical baseline — registry feed unavailable)',
    brand: '',
    category: '',
    canonical_url: '',
    image_url: '',
    updated_at: null,
  }));
  return {
    page: 1,
    pageSize: INDEXABILITY_PAGE_SIZE,
    totalPages: 1,
    products: seedProducts,
    hasMore: false,
    errorMessage,
    source: 'seeds',
  };
}

/**
 * Build a compact list of pagination links — current ± 2, plus
 * first/last when not adjacent. Returns the page numbers to render
 * (with `null` indicating a "..." gap). Pure for unit testing.
 */
export function buildPaginationLinks(
  currentPage: number,
  totalPages: number | null,
): Array<number | null> {
  if (totalPages === null) {
    // Unknown total — render only the immediate neighbors we trust.
    return [Math.max(1, currentPage - 1), currentPage].filter(
      (n, i, arr) => arr.indexOf(n) === i,
    );
  }
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const window = new Set<number>([1, totalPages, currentPage]);
  for (let d = 1; d <= 2; d += 1) {
    if (currentPage - d >= 1) window.add(currentPage - d);
    if (currentPage + d <= totalPages) window.add(currentPage + d);
  }
  const sorted = Array.from(window).sort((a, b) => a - b);
  const out: Array<number | null> = [];
  for (let i = 0; i < sorted.length; i += 1) {
    out.push(sorted[i]);
    if (i < sorted.length - 1 && sorted[i + 1] - sorted[i] > 1) out.push(null);
  }
  return out;
}
