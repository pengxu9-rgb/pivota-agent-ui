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
  // The Ordinary — Multi-Peptide Lash and Brow Serum. Used as the
  // POSITIVE baseline for the Demand Test Agent credibility check.
  // Verified in prod 2026-05-12.
  'sig_8b17eff870a4cd631ea61c56f99b5f99',
  // Tom Ford Beauty — Café Rose and Ombré Leather Duo Mini Set.
  // Luxury fragrance with strong distinctive product name; high
  // baseline visibility on the live web. (The "Eau d'Ombré Leather
  // Eau de Toilette" seed used pre-2026-05-12 was retired from the
  // backend catalog; this duo set is the closest current match.)
  'sig_bb9cdc5375aad0da780364a3a5df0b3f',
  // Supergoop! — Mineral Unseen Sunscreen SPF 40. Heavily reviewed
  // across the beauty-blog ecosystem; a good test of whether
  // grounding cites the canonical Pivota PDP vs the merchant's
  // own page. (SPF 50 variant retired; SPF 40 is the current real
  // catalog entry.)
  'sig_811f3a4d781db76ad4a60768b1691b29',
  // rhode — barrier restore cream. Hailey Bieber's brand; high
  // social-search volume, useful for measuring attribution against
  // celebrity-driven discovery flows.
  'sig_5241fe1b9ccca9f57cbffb4408395a3d',
  // COSRX — Poreless Clarifying Charcoal Mask Pink. K-beauty mass-
  // market staple; long product name + viral hashtag presence.
  // Has the richest description in the seed set (~1.7k chars).
  'sig_951fdc3a391d7878556e2ad3e7e58320',
  // Beauty of Joseon — Revive Under Eye Patch: Ginseng + Retinal.
  // K-beauty premium with strong distinctive title (rare ingredient
  // pair) — good signal-to-noise for query disambiguation.
  'sig_a4dde0770eb3b4757016e2a10b8fe978',
  //
  // All 6 verified in prod 2026-05-12:
  //   - non-NULL description (143-1774 chars)
  //   - non-NULL image_url
  //   - content_key populated (Stage 1)
  //   - no HTML entity pollution (&amp;, &rsquo;, &nbsp; absent)
  //   - merchant_id='external_seed' (transactable as referral)
  // Re-verify when adding new seeds; legacy 24-char-hex sigs from
  // the pre-mig-071 era 404 today and damage indexability.
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


/**
 * Merchants whose products MUST NOT appear in the public sitemap
 * (or llms.txt or any LLM-facing index).
 *
 * Why this list exists:
 *   - Transactable PDPs need merchant + payment + Shopify-checkout
 *     plumbing to actually fulfill orders. A test merchant has a
 *     real Shopify store but cannot accept checkout — clicking
 *     "buy" 500s. If an LLM cites the URL and a user clicks
 *     through, the checkout failure damages Pivota's reputation
 *     more than the indexing helps.
 *   - external_seed-backed PDPs are intentionally non-transactable
 *     by design (referral / redirect-to-merchant). They DO go in
 *     the sitemap because the "buy" CTA redirects to the upstream
 *     retailer, not Pivota checkout. So `merchant_id='external_seed'`
 *     is NOT in this exclude list.
 *
 * Long-term: replace this hardcoded list with a `catalog_merchants.
 * indexable` boolean column at the data layer. Doing that requires
 * a backend migration + filter at the get_discovery_feed operation,
 * which is its own PR. The hardcoded list is the pragmatic stopgap
 * — short list, single line edit when a new test merchant is added.
 */
export const TEST_MERCHANT_IDS: ReadonlySet<string> = Object.freeze(new Set([
  // MOYU test Shopify store (92sfrj-bi.myshopify.com). 741 products
  // on file (Stage 2b-i grouping created 339 product_groups for it),
  // all real product data, but Shopify Payments not configured —
  // checkout fails. Confirmed non-transactable 2026-05-12.
  'merch_efbc46b4619cfbdf',
])) as unknown as ReadonlySet<string>;


/**
 * True iff the merchant_id is safe to index publicly. Used by both
 * sitemap.ts and llms.txt/utils.ts as the second filter layer
 * (after isProductIdSitemapEligible).
 */
export function isMerchantIndexable(merchantId: string | null | undefined): boolean {
  if (!merchantId || typeof merchantId !== 'string') {
    // No merchant_id on the product means we can't verify
    // transactability. Default to indexable — most legacy
    // products predate the merchant_id field on the discovery
    // feed response. Better to over-include than miss real
    // PDPs.
    return true;
  }
  return !TEST_MERCHANT_IDS.has(merchantId.trim());
}
