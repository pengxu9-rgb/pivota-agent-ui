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

  // The URL id MUST be a minted sig. The previous fallback to content_key for
  // store-less brand-authored rows rested on "both /products/{sig} and
  // /products/{ck} resolve on the PDP" — that is FALSE in production: every
  // ck-keyed URL 500s. Verified 2026-07-25, all 7 in the live sitemap:
  //   GET /products/ck_… -> 500 (x-matched-path /500)
  // because get_pdp_v2 rejects a bare content_key with MISSING_MERCHANT_CONTEXT
  // ("merchant_id is required when canonical product identity cannot be
  // resolved"). Advertising a URL that 500s is strictly worse than omitting it:
  // it burns crawl budget on errors and teaches crawlers the domain is flaky,
  // right after the ISR/prerender work spent two PRs earning that budget back.
  //
  // Dropping them costs 7 offer-free citation candidates. To restore the
  // feature, make the BACKEND resolve a bare ck_ (or mint sigs for these rows)
  // and then relax this gate — do not re-add the fallback while the URL 500s.
  // The prefix alone is not enough: a bare "sig_" with no body is as dead as a
  // ck_ URL (/products/sig_ errors the same way), and because it passes
  // startsWith it would sail past the sig-only gate below and reach
  // sitemapIdGuard — which is deliberately un-forceable, so a backend emitting
  // a placeholder sig_id could wedge the cron red with no escape hatch. Drop
  // the row here instead, where a bad row is routine and costs one URL.
  //
  // Note this drop DOES pin the source label to `_partial`, unlike the ck-only
  // drop that F1 exempted — intentionally. A ck-only row is an expected
  // category (offer-free citation); a sig_id of literally "sig_" is a backend
  // data bug, which is exactly what that anomaly signal is for.
  const sig = String(row.sig_id || '').trim()
  if (!/^sig_.+/.test(sig)) return null
  const id = sig

  // Renderability gate (the 52%-dead-PDP fix): serving_eligible says the
  // backend WANTS the row public; `renderable` says the PDP will actually
  // render. A URL that fails it errors or serves an empty page, so
  // advertising it burns crawl budget. Drop only on an explicit `false`:
  //  - absent/undefined (a backend that predates the field) keeps the
  //    pre-fix behavior instead of emptying the sitemap, and
  //  - the filter runs BEFORE the content_key dedup, so the one-URL-per-
  //    product choice is made among renderable sigs only.
  // (ck-keyed rows can no longer reach here — they are dropped above.)
  //
  // WHAT `renderable` MEANS — corrected 2026-07-25, pivota-backend#1584.
  // It used to mean "the sig's own row has an approved, live-read-enabled
  // pdp_identity_listing". 29 live PDP fetches disproved that in BOTH
  // directions: rows with NO identity listing at all served full 200s with
  // product JSON-LD, and rows with a perfect listing served hard 500s.
  // get_pdp_v2's serving gate never reads pdp_identity_listing;
  // live_read_enabled gates the identity promotion lane, not the renderer.
  // The field now means "the gateway can resolve a PDP CONTENT ROUTE for this
  // row" — an acceptable external_product_seeds row on the row's route key,
  // or a live merchant-sync upstream. Nothing changes on this side: the
  // contract is still a plain boolean and the drop is still on explicit
  // `false`. Expect the URL count to GROW when the backend ships (~943 rows
  // that render fine were being withheld); the shrink guard does not gate
  // growth, so eyeball the first regenerated diff.
  if (row.renderable === false) return null

  return {
    id,
    contentKey,
    lastmod: parseLastmod(row.updated_at || row.last_modified),
  }
}

// Extract the product URL ids already advertised by a committed
// sitemap-products.xml. These are the INCUMBENTS — see preferSitemapId.
//
// Parses the same `<loc>` entries countLocs counts, so a file this function
// reads zero ids out of is either empty or not a product sitemap; callers
// treat that as "no incumbents" and fall back to the pure ordering.
export function parseSitemapProductIds(xml) {
  const ids = new Set()
  const prefix = `${SITEMAP_BASE_URL}/products/`
  const re = /<loc>([^<]*)<\/loc>/g
  let m
  while ((m = re.exec(String(xml || ''))) !== null) {
    const loc = m[1].trim()
    if (!loc.startsWith(prefix)) continue
    const raw = loc.slice(prefix.length)
    if (!raw) continue
    let id = raw
    try {
      id = decodeURIComponent(raw)
    } catch {
      // Leave the raw form — productUrlEntries re-encodes, so a malformed
      // escape still round-trips to the same <loc> and still matches.
    }
    ids.add(id)
  }
  return ids
}

// One URL per product. The catalog carries duplicate signatures for the same
// content_key (~1,218 products have >1 sig — different ingestion paths minted
// 24- vs 32-hex sigs), which used to emit up to 17% redundant sitemap URLs
// (7,407 URLs for 6,133 distinct products) and split index signal across
// duplicate pages. Pick ONE URL id per content_key.
//
// The ordering is a strict total order on ids, applied in three layers:
//
//   1. INCUMBENCY — an id already advertised by the committed
//      sitemap-products.xml beats one that is not.
//   2. Sig class — the longer sig (32-hex content sigs over legacy 24-hex).
//   3. Lexicographic.
//
// Layers 2+3 alone are deterministic but NOT stability-preserving, and
// 2026-07-25 (pivota-backend#1585 / PIVOTA-Agent#1828, "P3") turned that from
// theory into a measured 183-URL regression waiting on the next cron tick.
// P3 taught the gateway to resolve minted Path-C canonicals via
// `attached_product_key`, which flipped ~2,051 minted rows from
// renderable=false to renderable=true. 482 of those minted rows share a
// content_key with the external_seed MIRROR row they were minted from (their
// seed's external_product_id IS the mirror's source_product_id): 441 pairs now
// arrive with BOTH sigs sitemap-eligible where only the mirror used to survive
// the renderable filter. Live probes of 12 pairs (24 fetches) confirmed both
// sigs serve HTTP 200 with the same title and the same Product JSON-LD — they
// are true duplicates, and either URL is equally serviceable.
//
// Which means the ONLY thing that distinguishes them is index equity, and the
// mirror has all of it: all 367 of these products that appear in the live
// sitemap appear there under the MIRROR sig, because the minted sig was
// renderable=false when it was generated. Under layers 2+3 the freshly
// eligible minted sig wins 183 of those coin flips on hex/lexicographic order
// and silently REPLACES an indexed URL with a brand-new one. A sitemap whose
// canonical URL flip-flops is worse than a duplicate: the crawler has to
// rediscover and requalify the new URL and the old one decays to a soft 404 in
// the index, throwing away exactly the crawl equity #266/#269/#271/#272 spent
// four PRs earning. Incumbency makes the choice sticky instead: whatever URL we
// already advertise for a product stays the URL we advertise.
//
// Properties that matter:
//  - Deterministic. The incumbent set comes from a git-committed file, so the
//    same commit + same feed produce the same bytes.
//  - Convergent. After one run the winner IS the incumbent, so every later run
//    is a fixed point — the opposite of flip-flop.
//  - Never additive-blocking. Incumbency only ORDERS candidates that already
//    survived the eligibility + renderable filters; it cannot keep a URL in or
//    out of the sitemap on its own. A product whose incumbent sig goes
//    renderable=false loses it at the filter (which runs BEFORE this dedup, by
//    design — see readCanonicalProduct) and the surviving sibling is then the
//    only candidate, so genuinely dead URLs still rotate out.
//  - Degrades to the old behavior. No committed file (fresh clone, first run)
//    or an unparseable one means no incumbents and layers 2+3 decide, exactly
//    as before.
//
// The trade-off, stated plainly: the output is no longer a pure function of the
// backend feed — it also depends on the committed file. That is already true of
// the shrink guard, and it is the only signal available. The feed CANNOT
// distinguish these rows: minted and mirror rows are byte-identical across
// every field except sig_id, canonical_url (each self-referential) and
// last_modified. Deleting or hand-editing public/sitemap-products.xml
// therefore forfeits the incumbency history and re-picks lexicographically —
// one more reason never to hand-edit a cron-generated artifact.
export function preferSitemapId(a, b, incumbentIds) {
  if (incumbentIds && typeof incumbentIds.has === 'function') {
    const aIncumbent = incumbentIds.has(a)
    if (aIncumbent !== incumbentIds.has(b)) return aIncumbent ? a : b
  }
  const hexLen = (id) => (String(id).startsWith('sig_') ? id.length - 4 : -1)
  if (hexLen(a) !== hexLen(b)) return hexLen(a) > hexLen(b) ? a : b
  return a <= b ? a : b
}

export function mergeDuplicateProduct(existing, incoming, incumbentIds) {
  const id = preferSitemapId(existing.id, incoming.id, incumbentIds)
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

// Every product URL id must be a minted sig. /products/{content_key} 500s in
// production — get_pdp_v2 rejects a bare content_key with
// MISSING_MERCHANT_CONTEXT — so a ck-keyed URL in the published sitemap spends
// crawl budget on errors, right after #266/#269/#271/#272 spent four PRs
// earning that budget back. readCanonicalProduct (#274) drops sig-less rows;
// this is the last check before the bytes hit disk, and unlike a vitest
// assertion it covers every caller: the 6h cron in .github/workflows/
// sitemaps.yml, which commits straight to main, and a local `npm run sitemaps`.
//
// Deliberately NOT bypassable by SITEMAP_FORCE. That escape hatch exists for
// genuine catalog shrinks; a non-sig URL is never intentional.
export function sitemapIdGuard(urls) {
  if (!Array.isArray(urls)) return 'product URL list is not an array'

  // Length check as well as prefix: a bare "sig_" carries no id and errors just
  // like a ck_ URL. readCanonicalProduct already drops those, so this is
  // defense-in-depth against a regression there, not the primary gate.
  const prefix = `${SITEMAP_BASE_URL}/products/sig_`
  const bad = urls.filter((entry) => {
    const loc = String(entry?.loc ?? '')
    return !loc.startsWith(prefix) || loc.length <= prefix.length
  })
  if (bad.length === 0) return null

  const sample = bad
    .slice(0, 5)
    .map((entry) => entry?.loc ?? String(entry))
    .join(', ')
  return (
    `${bad.length} product URL(s) are not sig-keyed and would error for crawlers: ` +
    `${sample}${bad.length > 5 ? ', …' : ''}`
  )
}
