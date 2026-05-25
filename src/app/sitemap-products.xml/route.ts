import { NextResponse } from 'next/server'
import {
  isProductIdSitemapEligible,
  SITEMAP_BASE_URL,
  SITEMAP_SEED_PRODUCT_IDS,
} from '../sitemap-seeds'
import { buildSitemapUrlsetXml } from '../sitemap-xml'

export const revalidate = 3600
export const dynamic = 'force-dynamic'

const PIVOTA_CANONICAL_PAGE_SIZE = 1000
// TODO(VIS-5): add sitemap index shards before the canonical catalog exceeds 50k URLs.
const SITEMAP_MAX_URLS = 50000
const DEFAULT_CANONICAL_PRODUCTS_BASE_URL = 'https://web-production-fedb.up.railway.app'
const SITEMAP_CACHE_CONTROL =
  `public, max-age=${revalidate}, s-maxage=${revalidate}, stale-while-revalidate=${revalidate}`
const SITEMAP_FALLBACK_CACHE_CONTROL =
  'public, max-age=60, s-maxage=60, stale-while-revalidate=60'
const CANONICAL_PRODUCTS_FETCH_PAGE_TIMEOUT_MS = 8000
const CANONICAL_PRODUCTS_FETCH_TOTAL_BUDGET_MS = 12000
const SEED_PRODUCT_AUDIT_PAGE_TIMEOUT_MS = 5000
const SEED_PRODUCT_AUDIT_TOTAL_BUDGET_MS = 10000
const SEED_PRODUCT_LASTMOD = new Date('2026-05-12T00:00:00.000Z')

type SitemapSource =
  | 'serving_eligible'
  | 'serving_eligible_partial'
  | 'serving_eligible_truncated'
  | 'serving_eligible_unavailable'

type SitemapProduct = {
  id: string
  lastmod: Date
}

type CanonicalProductsPage = {
  items: unknown[]
  total: number | null
  limit: number
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

function getGatewayBaseUrl(): string {
  const configured = (
    process.env.PIVOTA_SITEMAP_GATEWAY_URL ||
    process.env.NEXT_PUBLIC_AGENT_DIRECT_API_URL ||
    process.env.NEXT_PUBLIC_AGENT_API_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '')

  if (/^https?:\/\//.test(configured)) {
    return /\/api\/gateway$/i.test(configured) ? configured : `${configured}/api/gateway`
  }
  return `${SITEMAP_BASE_URL}/api/gateway`
}

function readInteger(value: unknown, min: number): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n < min) return null
  return Math.floor(n)
}

function parseLastmod(value: unknown): Date {
  const raw = String(value || '').trim()
  if (!raw) return new Date()
  const withTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw) ? raw : `${raw}Z`
  const parsed = new Date(withTimezone)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
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

async function isStrictServingEligibleSeedProduct(
  productId: string,
  timeoutMs: number,
): Promise<boolean> {
  if (timeoutMs <= 0) return false
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(getGatewayBaseUrl(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
      body: JSON.stringify({
        operation: 'get_pdp_v2',
        payload: {
          product_ref: { product_id: productId },
          include: ['offers'],
          options: {
            debug: true,
            no_cache: true,
            cache_bypass: true,
            serving_eligible_only: true,
          },
        },
      }),
    })
    if (!res.ok) return false
    const data: unknown = await res.json()
    if (!data || typeof data !== 'object') return false
    const body = data as Record<string, unknown>
    return body.error == null && body.pdp_version === '2.0'
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function seedSitemapProducts(): Promise<SitemapProduct[]> {
  const startedAt = Date.now()
  const products: SitemapProduct[] = []
  for (const id of SITEMAP_SEED_PRODUCT_IDS) {
    if (!isProductIdSitemapEligible(id)) continue
    const remainingBudget = SEED_PRODUCT_AUDIT_TOTAL_BUDGET_MS - (Date.now() - startedAt)
    const eligible = await isStrictServingEligibleSeedProduct(
      id,
      Math.min(SEED_PRODUCT_AUDIT_PAGE_TIMEOUT_MS, remainingBudget),
    )
    if (eligible) {
      products.push({ id, lastmod: new Date(SEED_PRODUCT_LASTMOD) })
    }
  }
  return products
}

async function productsWithFallbackSeeds(
  products: SitemapProduct[],
  source: SitemapSource,
): Promise<SitemapProduct[]> {
  if (products.length || source !== 'serving_eligible_unavailable') return products
  return seedSitemapProducts()
}

function cacheControlForSource(source: SitemapSource): string {
  return source === 'serving_eligible' || source === 'serving_eligible_truncated'
    ? SITEMAP_CACHE_CONTROL
    : SITEMAP_FALLBACK_CACHE_CONTROL
}

async function fetchCanonicalProductsPage(
  baseUrl: string,
  offset: number,
  timeoutMs: number,
): Promise<CanonicalProductsPage> {
  if (timeoutMs <= 0) {
    throw new Error('canonical products fetch budget exhausted')
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
    throw new Error(`canonical products fetch failed with status ${res.status}`)
  }

  const data: unknown = await res.json()
  if (!data || typeof data !== 'object') {
    throw new Error('canonical products fetch returned invalid JSON')
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

  try {
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
  } catch (error) {
    console.error('sitemap-products.xml: canonical products fetch failed:', error)
    return {
      products,
      source: products.length ? 'serving_eligible_partial' : 'serving_eligible_unavailable',
    }
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
  const { products, source } = await collectServingEligibleProducts()
  const sitemapProducts = await productsWithFallbackSeeds(products, source)

  const urls = sitemapProducts.map((product) => ({
    loc: `${SITEMAP_BASE_URL}/products/${encodeURIComponent(product.id)}`,
    lastmod: product.lastmod,
    changefreq: 'weekly',
  }))

  const xml = buildSitemapUrlsetXml(urls)

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // s-maxage caches at the Vercel edge so crawler fetches don't pay the
      // backend cold-start (>30s on Railway idle, which trips GSC "Couldn't fetch").
      'Cache-Control': cacheControlForSource(source),
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
