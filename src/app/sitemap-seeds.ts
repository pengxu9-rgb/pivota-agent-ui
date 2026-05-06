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
  // Tom Ford Beauty — Eau d'Ombré Leather Eau de Toilette. Luxury
  // fragrance with strong distinctive product name; high baseline
  // visibility on the live web.
  'sig_7ed140c61dfa79d1c2876a7a',
  // Supergoop! — Unseen Sunscreen SPF 50. Heavily reviewed across the
  // beauty-blog ecosystem; a good test of whether grounding cites the
  // canonical Pivota PDP vs the merchant's own page.
  'sig_7d3a5ec03e4e70ce239eaa0c',
  // rhode — barrier restore cream. Hailey Bieber's brand; high
  // social-search volume, useful for measuring attribution against
  // celebrity-driven discovery flows.
  'sig_29ed2e5f318a5d70a2f645ed',
  // COSRX — Poreless Clarifying Charcoal Mask Pink. K-beauty mass-
  // market staple; long product name + viral hashtag presence.
  'sig_d89c869821249a14d3edbf25',
  // Beauty of Joseon — Revive Under Eye Patch: Ginseng + Retinal.
  // K-beauty premium with strong distinctive title (rare ingredient
  // pair) — good signal-to-noise for query disambiguation.
  'sig_dacaf022d6c6a9ed86ecab1f',
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
