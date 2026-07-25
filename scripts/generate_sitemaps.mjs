#!/usr/bin/env node
// Regenerate the committed static sitemaps in public/.
//
//   node scripts/generate_sitemaps.mjs          (or: npm run sitemaps)
//   SITEMAP_FORCE=1 node scripts/generate_sitemaps.mjs   # bypass the shrink guard
//
// Why these are committed files and not a serverless route: GSC reported
// "Couldn't fetch" for ~2 months because the former force-dynamic route
// re-fetched the Railway catalog at request time — cold edge + cold backend
// meant Googlebot regularly hit a slow response or a 503
// (serving_eligible_unavailable). Six PRs (#218/#219/#223/#246/#252/#256)
// tuned budgets and caches around that fetch; none removed it. Static public/
// assets serve in <1s with no function invocation, survive deploys, cold
// starts, and regions. The committed file is the durable last-known-good that
// PR #246's in-memory snapshot could never be.
//
// Regeneration cadence: .github/workflows/sitemaps.yml (every 6h + manual).
// The files carry no generated-at timestamp on purpose — output is
// deterministic (sorted by product id) so the workflow only commits (and
// Vercel only redeploys) when the catalog actually changed; git history is
// the generated-at record.

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PIVOTA_CANONICAL_PAGE_SIZE,
  SITEMAP_MAX_URLS,
  buildSitemapIndexXml,
  buildSitemapUrlsetXml,
  countLocs,
  mergeDuplicateProduct,
  parseSitemapProductIds,
  productUrlEntries,
  readCanonicalProduct,
  sitemapCountGuard,
  sitemapIdGuard,
  sitemapIndexEntries,
  staticSitemapEntries,
} from './sitemap_lib.mjs'

const DEFAULT_CANONICAL_PRODUCTS_BASE_URL = 'https://web-production-fedb.up.railway.app'
// CI budgets, not serverless budgets: the first request must survive a
// Railway idle cold start (>30s observed), and the whole run can take minutes.
const PAGE_TIMEOUT_MS = 60000
const PAGE_RETRY_DELAYS_MS = [2000, 8000, 20000]

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

class CanonicalProductsFetchError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CanonicalProductsFetchError'
  }
}

function getCanonicalProductsBaseUrl() {
  const configured = (
    process.env.PIVOTA_BACKEND_BASE_URL ||
    process.env.NEXT_PUBLIC_PIVOTA_BACKEND_BASE_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '')

  if (/^https?:\/\//.test(configured)) return configured
  return DEFAULT_CANONICAL_PRODUCTS_BASE_URL
}

function readInteger(value, min) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < min) return null
  return Math.floor(n)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchCanonicalProductsPageOnce(baseUrl, { offset = 0, cursor = null }) {
  const url = new URL('/api/canonical/products', baseUrl)
  url.searchParams.set('limit', String(PIVOTA_CANONICAL_PAGE_SIZE))
  if (cursor) {
    url.searchParams.set('cursor', cursor)
  } else {
    url.searchParams.set('offset', String(offset))
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS)
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout))

  if (!res.ok) {
    throw new CanonicalProductsFetchError(
      `canonical products fetch failed with status ${res.status}`,
    )
  }

  const data = await res.json()
  if (!data || typeof data !== 'object') {
    throw new CanonicalProductsFetchError('canonical products fetch returned invalid JSON')
  }

  return {
    items: Array.isArray(data.items) ? data.items : [],
    total: readInteger(data.total, 0),
    limit: readInteger(data.limit, 1) || PIVOTA_CANONICAL_PAGE_SIZE,
    hasMore: typeof data.has_more === 'boolean' ? data.has_more : null,
    nextCursor:
      typeof data.next_cursor === 'string' && data.next_cursor ? data.next_cursor : null,
  }
}

async function fetchCanonicalProductsPage(baseUrl, params) {
  const pageLabel = params.cursor ? `cursor=${params.cursor}` : `offset=${params.offset}`
  let lastError
  for (let attempt = 0; attempt <= PAGE_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      const delay = PAGE_RETRY_DELAYS_MS[attempt - 1]
      console.warn(
        `${pageLabel}: attempt ${attempt} failed (${lastError?.message}); retrying in ${delay}ms`,
      )
      await sleep(delay)
    }
    try {
      return await fetchCanonicalProductsPageOnce(baseUrl, params)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

export async function collectSitemapProducts(baseUrl, options = {}) {
  // Ids already advertised by the committed sitemap — they win their
  // content_key's dedup so an indexed URL is never swapped for an equivalent
  // sibling. See preferSitemapId for the full rationale. An empty/absent set
  // reproduces the pre-incumbency ordering exactly.
  const incumbentIds = options.incumbentIds instanceof Set ? options.incumbentIds : new Set()

  // Keyed by content_key — ONE URL per product. Duplicate signatures for the
  // same content_key are merged via mergeDuplicateProduct (deterministic id,
  // max lastmod) instead of each minting their own sitemap entry.
  const productsByContentKey = new Map()
  // Ids that lost a dedup. Only used for reporting: an incumbent in here is a
  // URL we are about to REPLACE, which is the failure mode incumbency exists to
  // prevent, so it must be loud rather than silent if it ever happens again.
  const displacedIds = new Set()
  let offset = 0
  let cursor = null
  let stoppedForCap = false
  let sawInvalidCanonicalItem = false
  let cursorPages = 0
  let offsetPages = 0

  while (productsByContentKey.size < SITEMAP_MAX_URLS) {
    const usingCursor = Boolean(cursor)
    const page = await fetchCanonicalProductsPage(baseUrl, usingCursor ? { cursor } : { offset })
    if (usingCursor) cursorPages++
    else offsetPages++
    if (page.items.length === 0) break

    for (const item of page.items) {
      const product = readCanonicalProduct(item)
      if (!product) {
        // A renderable=false drop is the EXPECTED dead-PDP filter, not a
        // malformed row — don't let it pin the source label to "_partial"
        // forever (that label is the anomaly signal for parse failures).
        //
        // Same reasoning for a ck-only row (valid content_key, no minted sig):
        // readCanonicalProduct now rejects those because /products/{ck} 500s,
        // but they are perfectly well-formed rows, not parse failures. Without
        // this arm every regeneration would report `serving_eligible_partial`
        // for as long as the feed contains one such row — permanently retiring
        // the very anomaly signal this block exists to protect.
        const isPlainItem = item && typeof item === 'object'
        const droppedAsDead =
          isPlainItem &&
          (item.renderable === false ||
            (String(item.content_key || '').startsWith('ck_') &&
              !String(item.sig_id || '').trim().startsWith('sig_')))
        if (!droppedAsDead) sawInvalidCanonicalItem = true
        continue
      }
      const existing = productsByContentKey.get(product.contentKey)
      if (existing) {
        const merged = mergeDuplicateProduct(existing, product, incumbentIds)
        if (merged.id !== existing.id) displacedIds.add(existing.id)
        if (merged.id !== product.id) displacedIds.add(product.id)
        productsByContentKey.set(product.contentKey, merged)
        continue
      }
      productsByContentKey.set(product.contentKey, product)
      if (productsByContentKey.size >= SITEMAP_MAX_URLS) break
    }

    // Keep `offset` in step as a fallback resume anchor: if the backend
    // stops emitting next_cursor mid-crawl (a widened-sitemap page whose
    // last row has a NULL sig_id, which the backend can't mint a cursor
    // from), the next page pages by offset from where we left off rather
    // than restarting at 0. Advance by ACTUAL rows returned, not the
    // nominal page size: the offset-resume point must equal rows consumed,
    // so a short page (fewer items than `limit`) can't make us skip rows.
    offset += page.items.length
    const hasMore =
      page.hasMore !== null
        ? page.hasMore
        : page.total !== null
          ? offset < page.total
          : page.items.length >= page.limit

    if (productsByContentKey.size >= SITEMAP_MAX_URLS && hasMore) {
      stoppedForCap = true
      break
    }
    if (!hasMore) break

    // Prefer the backend's keyset cursor (pivota-backend PR #1239): it seeks
    // on the sort key, so page cost stays constant instead of growing with
    // OFFSET depth (deep pages could trip the backend's 4s DB timeout).
    // Backends that predate next_cursor keep paging by offset.
    cursor = page.nextCursor
    if (usingCursor && !cursor) {
      // Downgrade cursor→offset (see above). Rare and self-correcting, but
      // loud because a wrong offset anchor here silently truncates the set.
      console.warn(
        `pagination downgraded to offset at offset=${offset} ` +
          `(backend returned has_more with no next_cursor)`,
      )
    }
  }

  console.log(
    `pagination: ${cursorPages + offsetPages} page(s) ` +
      `(cursor=${cursorPages}, offset=${offsetPages})`,
  )

  // Deterministic order: backend pagination order is mutable
  // (content_changed_at DESC), which would produce a different diff — and
  // therefore a commit + deploy — on every run even for an unchanged catalog.
  const products = Array.from(productsByContentKey.values())
  products.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  // An incumbent that lost its dedup means a URL swap. Incumbency makes this
  // impossible for a plain 2-candidate group, so it can only surface if the
  // committed file already carried two sigs for one content_key (a sitemap
  // predating the dedup). Report it rather than assert: dropping a
  // pre-existing extra URL is the CORRECT outcome there, we just never want it
  // to be invisible.
  const replacedIncumbentIds = Array.from(displacedIds)
    .filter((id) => incumbentIds.has(id))
    .sort()

  return {
    products,
    replacedIncumbentIds,
    source: sawInvalidCanonicalItem
      ? 'serving_eligible_partial'
      : stoppedForCap
        ? 'serving_eligible_truncated'
        : 'serving_eligible',
  }
}

// Reads the committed product sitemap once and derives both things we need
// from it: the shrink guard's previous count and the dedup's incumbent ids.
// A missing file yields `{ count: null, ids: empty }` — first run / fresh
// clone, guard and incumbency both stand down.
async function readExistingProductSitemap(filePath) {
  try {
    const xml = await readFile(filePath, 'utf8')
    return { count: countLocs(xml), ids: parseSitemapProductIds(xml) }
  } catch {
    return { count: null, ids: new Set() }
  }
}

async function writeIfChanged(filePath, content) {
  try {
    if ((await readFile(filePath, 'utf8')) === content) {
      return false
    }
  } catch {
    // File missing — write it.
  }
  await writeFile(filePath, content, 'utf8')
  return true
}

export async function generateSitemaps() {
  const baseUrl = getCanonicalProductsBaseUrl()
  const productsPath = path.join(PUBLIC_DIR, 'sitemap-products.xml')

  // Read BEFORE fetching: the committed file supplies the dedup's incumbent
  // ids as well as the shrink guard's previous count.
  const previous = await readExistingProductSitemap(productsPath)
  const previousCount = previous.count

  console.log(
    `fetching canonical products from ${baseUrl} ` +
      `(incumbent urls=${previous.ids.size}) ...`,
  )

  const { products, source, replacedIncumbentIds } = await collectSitemapProducts(baseUrl, {
    incumbentIds: previous.ids,
  })
  const urls = productUrlEntries(products)

  const keptIncumbents = products.reduce((n, p) => n + (previous.ids.has(p.id) ? 1 : 0), 0)
  console.log(
    `incumbency: kept=${keptIncumbents}/${previous.ids.size} ` +
      `new=${products.length - keptIncumbents} replaced=${replacedIncumbentIds.length}`,
  )
  if (replacedIncumbentIds.length > 0) {
    console.warn(
      `NOTE: ${replacedIncumbentIds.length} advertised URL(s) lost their content_key dedup ` +
        `and will be dropped: ${replacedIncumbentIds.slice(0, 5).join(', ')}` +
        `${replacedIncumbentIds.length > 5 ? ', …' : ''}. Expected only when the committed ` +
        `sitemap predates the content_key dedup (two sigs for one product).`,
    )
  }

  // Checked before the shrink guard: a non-sig URL is the more specific and
  // more actionable failure, and it is the one SITEMAP_FORCE must never wave
  // through.
  const idViolation = sitemapIdGuard(urls)
  if (idViolation) {
    console.error(
      `REFUSING to write sitemaps: ${idViolation}.\n` +
        `Advertising a URL that errors is strictly worse than omitting it — it ` +
        `burns crawl budget and teaches crawlers the domain is flaky. Fix ` +
        `readCanonicalProduct (or mint sigs for these rows); SITEMAP_FORCE does ` +
        `NOT bypass this guard.`,
    )
    process.exitCode = 1
    return null
  }

  const guardViolation = sitemapCountGuard(urls.length, previousCount)
  if (guardViolation && process.env.SITEMAP_FORCE !== '1') {
    console.error(
      `REFUSING to write sitemaps: ${guardViolation}.\n` +
        `A truncated sitemap published over the full set gets cached by crawlers ` +
        `as THE sitemap (the PR #219/#223 incident). If the catalog really ` +
        `shrank, re-run with SITEMAP_FORCE=1.`,
    )
    process.exitCode = 1
    return null
  }

  const comment = `source=${source} urls=${urls.length}`
  const written = []
  if (await writeIfChanged(productsPath, buildSitemapUrlsetXml(urls, comment))) {
    written.push('sitemap-products.xml')
  }
  if (
    await writeIfChanged(
      path.join(PUBLIC_DIR, 'sitemap-static.xml'),
      buildSitemapUrlsetXml(staticSitemapEntries()),
    )
  ) {
    written.push('sitemap-static.xml')
  }
  if (
    await writeIfChanged(
      path.join(PUBLIC_DIR, 'sitemap.xml'),
      buildSitemapIndexXml(sitemapIndexEntries()),
    )
  ) {
    written.push('sitemap.xml')
  }

  console.log(
    `source=${source} product_urls=${urls.length} previous=${previousCount ?? 'none'} ` +
      `written=[${written.join(', ') || 'nothing — all unchanged'}]`,
  )
  return { urlCount: urls.length, source, written }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  generateSitemaps().catch((error) => {
    console.error('sitemap generation failed:', error)
    process.exitCode = 1
  })
}
