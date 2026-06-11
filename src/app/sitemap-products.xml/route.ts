import { NextResponse } from 'next/server'
import { SITEMAP_BASE_URL } from '../sitemap-seeds'
import { buildSitemapUrlsetXml } from '../sitemap-xml'

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
const SITEMAP_CACHE_CONTROL =
  `public, max-age=${revalidate}, s-maxage=${revalidate}, stale-while-revalidate=${revalidate}`
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

type SitemapSource = 'serving_eligible' | 'serving_eligible_partial' | 'serving_eligible_truncated'

// Last successful build, held in module scope so a transient backend failure on
// a *warm* instance can serve the previous real catalog (slightly stale, never
// fabricated) instead of a 503. This is NOT the "5-URL stub" the failure path
// below deliberately rejects: it is the genuine serving-eligible set from a
// recent successful pull, which is exactly what a sitemap is allowed to be —
// advisory and a little behind. It does not survive cold starts or span
// regions; durable cross-instance caching (KV/blob) is a follow-up if needed.
type SitemapSnapshot = {
  xml: string
  source: SitemapSource
  urlCount: number
}
let lastKnownGood: SitemapSnapshot | null = null

// Test-only: reset module-scoped last-known-good so each case starts cold.
export function __resetSitemapCacheForTests(): void {
  lastKnownGood = null
}

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

function isServingEligibleProduct(item: Record<string, unknown>): boolean {
  return (
    isTruthyEligibility(item.serving_eligible) ||
    isTruthyEligibility(item.is_serving_eligible)
  )
}

function readCanonicalProduct(item: unknown): SitemapProduct | null {
  if (!item || typeof item !== 'object') return null
  const row = item as Record<string, unknown>
  if (!isServingEligibleProduct(row)) return null

  const id = String(row.sig_id || '').trim()
  if (!id.startsWith('sig_')) return null
  const contentKey = String(row.content_key || '').trim()
  if (!contentKey.startsWith('ck_')) return null

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
    if (lastKnownGood) {
      return new NextResponse(lastKnownGood.xml, {
        status: 200,
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Cache-Control': SITEMAP_STALE_CACHE_CONTROL,
          'X-Pivota-Sitemap-Source': `${lastKnownGood.source}_stale`,
          'X-Pivota-Sitemap-Url-Count': String(lastKnownGood.urlCount),
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
  lastKnownGood = { xml, source, urlCount: urls.length }

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
