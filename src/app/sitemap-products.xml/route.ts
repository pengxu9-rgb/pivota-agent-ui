import { NextResponse } from 'next/server'
import { SITEMAP_BASE_URL } from '../sitemap-seeds'
import { buildSitemapUrlsetXml } from '../sitemap-xml'
import {
  getLastKnownGood,
  setLastKnownGood,
  type SitemapSource,
} from './lastKnownGood'

export const revalidate = 3600
export const dynamic = 'force-dynamic'
// Allow a slow cold-backend rebuild to run to completion. Vercel Pro defaults
// serverless functions to a ~15s ceiling; without this, a cold Railway backend
// (multi-second per page × 6 pages) gets the function killed mid-build and the
// crawler sees a timeout — which GSC records as "Couldn't fetch". A 25s sitemap
// response is perfectly acceptable to Googlebot; a timeout is not.
export const maxDuration = 30

const PIVOTA_CANONICAL_PAGE_SIZE = 1000
// TODO(VIS-5): add sitemap index shards before the canonical catalog exceeds 50k URLs.
const SITEMAP_MAX_URLS = 50000
const DEFAULT_CANONICAL_PRODUCTS_BASE_URL = 'https://web-production-fedb.up.railway.app'
// Edge-cache TTLs tuned so crawlers (GSC, Bingbot, GPTBot) never pay the
// serverless cold-start + backend catalog fetch that trips GSC "Couldn't fetch".
// After the first warm-up the Vercel edge serves fresh for s-maxage, then serves
// the STALE copy INSTANTLY for the long stale-while-revalidate window while it
// revalidates in the background. As long as the URL is fetched at least once per
// week (crawlers guarantee this), the edge never fully expires, so no fetch ever
// blocks on a cold multi-second response. (max-age is the browser TTL and is
// irrelevant to crawlers, which always revalidate.)
const SITEMAP_FRESH_SECONDS = 21600 // 6h — re-pull the canonical catalog at most this often
const SITEMAP_STALE_SECONDS = 604800 // 7d — serve stale instantly + revalidate in the background
const SITEMAP_CACHE_CONTROL =
  `public, max-age=${revalidate}, s-maxage=${SITEMAP_FRESH_SECONDS}, stale-while-revalidate=${SITEMAP_STALE_SECONDS}`
// When we fall back to the last-known-good snapshot, cache it for a short
// window so the edge keeps answering 200 while the backend recovers, but
// revalidate sooner than a fresh build so we re-attempt promptly.
const SITEMAP_STALE_CACHE_CONTROL =
  'public, max-age=300, s-maxage=300, stale-while-revalidate=3600'
// Total budget raised from 12s → 25s: a full rebuild is 6 pages (5.6k URLs),
// and a cold backend can spend several seconds per page. The old 12s budget
// could exhaust mid-pagination and throw, turning a slow-but-fine backend into
// a hard 503. maxDuration (30s) sits above this so the budget trips first.
const CANONICAL_PRODUCTS_FETCH_PAGE_TIMEOUT_MS = 8000
const CANONICAL_PRODUCTS_FETCH_TOTAL_BUDGET_MS = 25000
const SITEMAP_BACKEND_FAILURE_RETRY_SECONDS = 300

// SitemapSource and the last-known-good snapshot live in ./lastKnownGood — Next
// route files may only export a fixed set of fields, so the snapshot state and
// its test reset cannot live here.

type SitemapProduct = {
  id: string
  lastmod: Date | null
}

type CanonicalProductsPage = {
  items: unknown[]
  total: number | null
  limit: number
}

class CanonicalProductsFetchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CanonicalProductsFetchError'
  }
}

function getCanonicalProductsBaseUrl(): string {
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

function readInteger(value: unknown, min: number): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n < min) return null
  return Math.floor(n)
}

// Returns null when the backend has no timestamp for this row.
// A missing <lastmod> is a trusted signal ("unknown"); a fabricated one
// is treated by Google as inaccurate and causes the entire sitemap to
// be deprioritized as a freshness signal.
function parseLastmod(value: unknown): Date | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  const withTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw) ? raw : `${raw}Z`
  const parsed = new Date(withTimezone)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isTruthyEligibility(value: unknown): boolean {
  return value === true || value === 1 || value === 'true'
}

// A row belongs in the sitemap when the backend marks it serving_eligible
// (buyable) OR index_eligible (offer-free citation — e.g. store-less brands).
// The backend already applies the authoritative gate (and only returns
// index_eligible rows when INDEX_ELIGIBLE_SITEMAP is on), so trusting these
// flags can't surface anything the backend didn't intend.
function isSitemapEligibleProduct(item: Record<string, unknown>): boolean {
  return (
    isTruthyEligibility(item.serving_eligible) ||
    isTruthyEligibility(item.is_serving_eligible) ||
    isTruthyEligibility(item.index_eligible)
  )
}

function readCanonicalProduct(item: unknown): SitemapProduct | null {
  if (!item || typeof item !== 'object') return null
  const row = item as Record<string, unknown>
  if (!isSitemapEligibleProduct(row)) return null

  // content_key is the core identity and the served-PDP key — always required.
  const contentKey = String(row.content_key || '').trim()
  if (!contentKey.startsWith('ck_')) return null

  // Prefer the canonical sig for the URL; fall back to content_key for
  // store-less brand-authored rows that have no minted sig (offer-free
  // citation). Both /products/{sig} and /products/{ck} resolve on the PDP.
  const sig = String(row.sig_id || '').trim()
  const id = sig.startsWith('sig_') ? sig : contentKey

  return {
    id,
    lastmod: parseLastmod(row.updated_at || row.last_modified),
  }
}

async function fetchCanonicalProductsPage(
  baseUrl: string,
  offset: number,
  timeoutMs: number,
): Promise<CanonicalProductsPage> {
  if (timeoutMs <= 0) {
    throw new CanonicalProductsFetchError('canonical products fetch budget exhausted')
  }

  const url = new URL('/api/canonical/products', baseUrl)
  url.searchParams.set('limit', String(PIVOTA_CANONICAL_PAGE_SIZE))
  url.searchParams.set('offset', String(offset))

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout))

  if (!res.ok) {
    throw new CanonicalProductsFetchError(
      `canonical products fetch failed with status ${res.status}`,
    )
  }

  const data: unknown = await res.json()
  if (!data || typeof data !== 'object') {
    throw new CanonicalProductsFetchError('canonical products fetch returned invalid JSON')
  }

  const page = data as Record<string, unknown>
  return {
    items: Array.isArray(page.items) ? page.items : [],
    total: readInteger(page.total, 0),
    limit: readInteger(page.limit, 1) || PIVOTA_CANONICAL_PAGE_SIZE,
  }
}

async function collectServingEligibleProducts(): Promise<{
  products: SitemapProduct[]
  source: SitemapSource
}> {
  const baseUrl = getCanonicalProductsBaseUrl()
  const startedAt = Date.now()
  const products: SitemapProduct[] = []
  const seenIds = new Set<string>()
  let offset = 0
  let stoppedForCap = false
  let sawInvalidCanonicalItem = false

  while (products.length < SITEMAP_MAX_URLS) {
    const remainingBudget =
      CANONICAL_PRODUCTS_FETCH_TOTAL_BUDGET_MS - (Date.now() - startedAt)
    const page = await fetchCanonicalProductsPage(
      baseUrl,
      offset,
      Math.min(CANONICAL_PRODUCTS_FETCH_PAGE_TIMEOUT_MS, remainingBudget),
    )
    if (page.items.length === 0) break

    for (const item of page.items) {
      const product = readCanonicalProduct(item)
      if (!product) {
        sawInvalidCanonicalItem = true
        continue
      }
      if (seenIds.has(product.id)) continue
      seenIds.add(product.id)
      products.push(product)
      if (products.length >= SITEMAP_MAX_URLS) break
    }

    const nextOffset = offset + page.limit
    const hasMore =
      page.total !== null ? nextOffset < page.total : page.items.length >= page.limit

    if (products.length >= SITEMAP_MAX_URLS && hasMore) {
      stoppedForCap = true
      break
    }
    if (!hasMore) break

    offset = nextOffset
  }

  return {
    products,
    source: sawInvalidCanonicalItem
      ? 'serving_eligible_partial'
      : stoppedForCap
        ? 'serving_eligible_truncated'
        : 'serving_eligible',
  }
}

export async function GET() {
  let products: SitemapProduct[]
  let source: SitemapSource
  try {
    const result = await collectServingEligibleProducts()
    products = result.products
    source = result.source
  } catch (error) {
    console.error('sitemap-products.xml: canonical products fetch failed:', error)

    // Prefer the last successful build (real catalog, slightly stale) over a
    // 503. A transient backend blip that returns 503 is recorded by GSC as
    // "Couldn't fetch" and backs off re-crawling for days — far worse than
    // serving URLs that are a few minutes old.
    const snapshot = getLastKnownGood()
    if (snapshot) {
      return new NextResponse(snapshot.xml, {
        status: 200,
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Cache-Control': SITEMAP_STALE_CACHE_CONTROL,
          'X-Pivota-Sitemap-Source': `${snapshot.source}_stale`,
          'X-Pivota-Sitemap-Url-Count': String(snapshot.urlCount),
        },
      })
    }

    // No snapshot to fall back to (cold instance + backend down). Honest
    // failure beats a 5-URL stub: crawlers caching a tiny sitemap as the
    // canonical answer is far worse than a transient 503.
    return new NextResponse('canonical products feed unavailable\n', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, must-revalidate',
        'Retry-After': String(SITEMAP_BACKEND_FAILURE_RETRY_SECONDS),
        'X-Pivota-Sitemap-Source': 'serving_eligible_unavailable',
      },
    })
  }

  const urls = products.map((product) => ({
    loc: `${SITEMAP_BASE_URL}/products/${encodeURIComponent(product.id)}`,
    lastmod: product.lastmod ?? undefined,
    changefreq: 'weekly',
  }))

  const xml = buildSitemapUrlsetXml(urls)

  // Snapshot this successful build so a later failure on this warm instance can
  // serve it instead of 503.
  setLastKnownGood({ xml, source, urlCount: urls.length })

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // s-maxage caches at the Vercel edge so crawler fetches don't pay the
      // backend cold-start (>30s on Railway idle, which trips GSC "Couldn't fetch").
      'Cache-Control': SITEMAP_CACHE_CONTROL,
      'X-Pivota-Sitemap-Source': source,
      'X-Pivota-Sitemap-Url-Count': String(urls.length),
    },
  })
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': SITEMAP_CACHE_CONTROL,
    },
  })
}
