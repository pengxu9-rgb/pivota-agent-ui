// Pure sitemap-building logic shared by scripts/generate_sitemaps.mjs and its
// tests. Plain JS ports of the former src/app/sitemap-xml.ts,
// src/app/sitemap-routes.ts, and the eligibility/lastmod logic of the former
// src/app/sitemap-products.xml/route.ts (all deleted when the sitemaps moved
// from request-time serverless routes to committed static files in public/ —
// the durable fix for GSC "Couldn't fetch").
//
// Duplicated from src/app/sitemap-seeds.ts (a .mjs script cannot import TS).
// sitemap-seeds.ts remains the source of truth for app code.
export const SITEMAP_BASE_URL = 'https://agent.pivota.cc'

export const PIVOTA_CANONICAL_PAGE_SIZE = 1000
// TODO(VIS-5): add sitemap index shards before the canonical catalog exceeds 50k URLs.
export const SITEMAP_MAX_URLS = 50000

export function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// `comment`, when provided, is emitted between the XML declaration and the
// root element. It replaces the X-Pivota-Sitemap-Source/Url-Count response
// headers the deleted dynamic route used to set. Keep it deterministic (no
// timestamps): a value that changes every run would force a commit + deploy
// every cron tick even when the catalog is unchanged — git history is the
// generated-at record.
export function buildSitemapUrlsetXml(urls, comment) {
  const entries = urls
    .map((e) => {
      const fields = [
        `    <loc>${escapeXml(e.loc)}</loc>`,
        e.lastmod ? `    <lastmod>${e.lastmod.toISOString()}</lastmod>` : null,
        e.changefreq ? `    <changefreq>${escapeXml(e.changefreq)}</changefreq>` : null,
        typeof e.priority === 'number' ? `    <priority>${e.priority}</priority>` : null,
      ].filter(Boolean)

      return `  <url>\n${fields.join('\n')}\n  </url>`
    })
    .join('\n')

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    (comment ? `<!-- ${comment} -->\n` : '') +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${entries}\n` +
    `</urlset>\n`
  )
}

export function buildSitemapIndexXml(sitemaps, comment) {
  const entries = sitemaps
    .map((e) => {
      const fields = [
        `    <loc>${escapeXml(e.loc)}</loc>`,
        e.lastmod ? `    <lastmod>${e.lastmod.toISOString()}</lastmod>` : null,
      ].filter(Boolean)

      return `  <sitemap>\n${fields.join('\n')}\n  </sitemap>`
    })
    .join('\n')

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    (comment ? `<!-- ${comment} -->\n` : '') +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${entries}\n` +
    `</sitemapindex>\n`
  )
}

// We deliberately omit <lastmod> for these entries.
//
// Per Google's 2023 lastmod-validation policy, an inaccurate lastmod
// causes the entire sitemap to be deprioritized as a freshness signal.
// We do not track real "last content change" for the homepage or the
// /products grid, and we do not track a real lastmod for the index
// itself — each child sitemap carries its own. A missing <lastmod>
// is a trusted "unknown" signal; a fabricated `new Date()` is not.
export function staticSitemapEntries() {
  return [
    {
      loc: SITEMAP_BASE_URL,
      changefreq: 'daily',
      priority: 1,
    },
    {
      loc: `${SITEMAP_BASE_URL}/products`,
      changefreq: 'daily',
      priority: 0.9,
    },
  ]
}

export function sitemapIndexEntries() {
  return [
    { loc: `${SITEMAP_BASE_URL}/sitemap-static.xml` },
    { loc: `${SITEMAP_BASE_URL}/sitemap-products.xml` },
  ]
}

// Returns null when the backend has no timestamp for this row.
// A missing <lastmod> is a trusted signal ("unknown"); a fabricated one
// is treated by Google as inaccurate and causes the entire sitemap to
// be deprioritized as a freshness signal.
export function parseLastmod(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const withTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw) ? raw : `${raw}Z`
  const parsed = new Date(withTimezone)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isTruthyEligibility(value) {
  return value === true || value === 1 || value === 'true'
}

// A row belongs in the sitemap when the backend marks it serving_eligible
// (buyable) OR index_eligible (offer-free citation — e.g. store-less brands).
// The backend already applies the authoritative gate (and only returns
// index_eligible rows when INDEX_ELIGIBLE_SITEMAP is on), so trusting these
// flags can't surface anything the backend didn't intend.
export function isSitemapEligibleProduct(item) {
  return (
    isTruthyEligibility(item.serving_eligible) ||
    isTruthyEligibility(item.is_serving_eligible) ||
    isTruthyEligibility(item.index_eligible)
  )
}

export function readCanonicalProduct(item) {
  if (!item || typeof item !== 'object') return null
  const row = item
  if (!isSitemapEligibleProduct(row)) return null

  // content_key is the core identity and the served-PDP key — always required.
  const contentKey = String(row.content_key || '').trim()
  if (!contentKey.startsWith('ck_')) return null

  // Prefer the canonical sig for the URL; fall back to content_key for
  // store-less brand-authored rows that have no minted sig (offer-free
  // citation). Both /products/{sig} and /products/{ck} resolve on the PDP.
  const sig = String(row.sig_id || '').trim()
  const id = sig.startsWith('sig_') ? sig : contentKey

  // Renderability gate (the 52%-dead-PDP fix): serving_eligible says the
  // backend WANTS the row public; `renderable` says the PDP will actually
  // render (the sig's own row has an approved, live-read-enabled
  // pdp_identity_listing — row grain, sibling listings don't count). A URL
  // that fails it serves the generic shell, so advertising it points
  // crawlers at an empty page. Drop only on an explicit `false`:
  //  - absent/undefined (a backend that predates the field) keeps the
  //    pre-fix behavior instead of emptying the sitemap, and
  //  - the filter runs BEFORE the content_key dedup, so the one-URL-per-
  //    product choice is made among renderable sigs only.
  // ck-keyed citation rows (no sig) are exempt: `renderable` is defined for
  // sig PDPs, and the offer-free citation surface has its own gate.
  if (sig.startsWith('sig_') && row.renderable === false) return null

  return {
    id,
    contentKey,
    lastmod: parseLastmod(row.updated_at || row.last_modified),
  }
}

// One URL per product. The catalog carries duplicate signatures for the same
// content_key (~1,218 products have >1 sig — different ingestion paths minted
// 24- vs 32-hex sigs), which used to emit up to 17% redundant sitemap URLs
// (7,407 URLs for 6,133 distinct products) and split index signal across
// duplicate pages. Pick one deterministic URL id per content_key:
// prefer the longer sig class (32-hex content sigs over legacy 24-hex, any
// sig over the ck_ fallback), then lexicographic — stable run-to-run
// regardless of backend page ordering, so URLs don't churn between builds.
export function preferSitemapId(a, b) {
  const hexLen = (id) => (String(id).startsWith('sig_') ? id.length - 4 : -1)
  if (hexLen(a) !== hexLen(b)) return hexLen(a) > hexLen(b) ? a : b
  return a <= b ? a : b
}

export function mergeDuplicateProduct(existing, incoming) {
  const id = preferSitemapId(existing.id, incoming.id)
  const lastmod =
    !existing.lastmod
      ? incoming.lastmod
      : !incoming.lastmod
        ? existing.lastmod
        : existing.lastmod > incoming.lastmod
          ? existing.lastmod
          : incoming.lastmod
  return { id, contentKey: existing.contentKey, lastmod }
}

export function productUrlEntries(products) {
  return products.map((product) => ({
    loc: `${SITEMAP_BASE_URL}/products/${encodeURIComponent(product.id)}`,
    lastmod: product.lastmod ?? undefined,
    changefreq: 'weekly',
  }))
}

// Count <loc> entries in an existing sitemap file — used by the sanity guard.
export function countLocs(xml) {
  return (String(xml).match(/<loc>/g) || []).length
}

// The #219/#223 lesson: never publish a truncated/stub sitemap over the full
// set — crawlers cache the tiny file as THE sitemap. Refuse to write when the
// new build is implausibly small, either absolutely or vs the committed file.
export const SITEMAP_MIN_PRODUCT_URLS = 1000
export const SITEMAP_MIN_RATIO_OF_PREVIOUS = 0.5

export function sitemapCountGuard(newCount, previousCount) {
  if (newCount < SITEMAP_MIN_PRODUCT_URLS) {
    return `new product URL count ${newCount} is below the absolute floor ${SITEMAP_MIN_PRODUCT_URLS}`
  }
  if (
    typeof previousCount === 'number' &&
    previousCount > 0 &&
    newCount < previousCount * SITEMAP_MIN_RATIO_OF_PREVIOUS
  ) {
    return `new product URL count ${newCount} is less than ${SITEMAP_MIN_RATIO_OF_PREVIOUS * 100}% of the committed count ${previousCount}`
  }
  return null
}
