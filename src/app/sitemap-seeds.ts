/**
 * Seed product IDs that the public sitemaps must always include,
 * regardless of whether the dynamic registry fetch is available at
 * build/request time.
 *
 * Why this list exists:
 *
 * - The dynamic feed (`getAllProducts` → backend) is fragile in the
 *   Vercel build env (no `NEXT_PUBLIC_API_URL`, same-origin
 *   `/api/gateway` proxy doesn't exist at build time).
 * - Even at request time, transient API outages would silently produce
 *   a sitemap with zero product URLs.
 * - We want certain high-priority PDPs guaranteed-discoverable by
 *   Google / Gemini grounding — for example, the verified PDP we use
 *   as the POSITIVE baseline in the Demand Test Agent credibility
 *   check (`scripts/agent_center_baseline.py` in pivota-backend).
 *
 * To add a product: append its `sig_*` ID. Order is preserved.
 * `ext_*` aliases must NOT appear in this list — they're alternate
 * URLs and the canonical-PDP runbook explicitly excludes them from
 * the products sitemap.
 */
export const SITEMAP_SEED_PRODUCT_IDS: ReadonlyArray<string> = Object.freeze([
  // the ordinary Multi-Peptide Lash and Brow Serum — used as the
  // POSITIVE baseline for the Demand Test Agent credibility check.
  'sig_7ad40676c42fb9c96e2a8136',
] as const);

export const SITEMAP_BASE_URL = 'https://agent.pivota.cc';

/**
 * Per the indexing-discoverability runbook, the products sitemap must
 * exclude `ext_*` alias URLs. This helper enforces that for any
 * product_id we feed in (seed or dynamic).
 */
export function isProductIdSitemapEligible(productId: string | null | undefined): boolean {
  if (!productId || typeof productId !== 'string') return false;
  const trimmed = productId.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('ext_')) return false;
  return true;
}
