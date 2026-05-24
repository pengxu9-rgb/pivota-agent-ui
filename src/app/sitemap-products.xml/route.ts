import { NextResponse } from 'next/server'
import { SITEMAP_BASE_URL } from '../sitemap-seeds'

export const revalidate = 3600
export const dynamic = 'force-dynamic'

const PIVOTA_CANONICAL_PAGE_SIZE = 1000
// TODO(VIS-5): add sitemap index shards before the canonical catalog exceeds 50k URLs.
const SITEMAP_MAX_URLS = 50000
const DEFAULT_CANONICAL_PRODUCTS_BASE_URL = 'https://web-production-fedb.up.railway.app'
const SITEMAP_CACHE_CONTROL =
  `public, max-age=${revalidate}, s-maxage=${revalidate}, stale-while-revalidate=86400`

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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildSitemapXml(urls: ReadonlyArray<{
  loc: string
  lastmod: Date
  changefreq: string
}>): string {
  const entries = urls
    .map(
      (e) =>
        `  <url>\n` +
        `    <loc>${escapeXml(e.loc)}</loc>\n` +
        `    <lastmod>${e.lastmod.toISOString()}</lastmod>\n` +
        `    <changefreq>${e.changefreq}</changefreq>\n` +
        `  </url>`,
    )
    .join('\n')
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${entries}\n` +
    `</urlset>\n`
  )
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

function parseLastmod(value: unknown): Date {
  const raw = String(value || '').trim()
  if (!raw) return new Date()
  const withTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw) ? raw : `${raw}Z`
  const parsed = new Date(withTimezone)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function isServingEligibleProduct(item: Record<string, unknown>): boolean {
  const flags = [
    item.serving_eligible,
    item.is_serving_eligible,
    item.indexable,
    item.is_indexable,
  ]
  return !flags.some((value) => value === false || value === 0 || value === 'false')
}

function readCanonicalProduct(item: unknown): SitemapProduct | null {
  if (!item || typeof item !== 'object') return null
  const row = item as Record<string, unknown>
  if (!isServingEligibleProduct(row)) return null

  const id = String(row.sig_id || '').trim()
  if (!id.startsWith('sig_')) return null

  return {
    id,
    lastmod: parseLastmod(row.updated_at || row.last_modified),
  }
}

async function fetchCanonicalProductsPage(
  baseUrl: string,
  offset: number,
): Promise<CanonicalProductsPage> {
  const url = new URL('/api/canonical/products', baseUrl)
  url.searchParams.set('limit', String(PIVOTA_CANONICAL_PAGE_SIZE))
  url.searchParams.set('offset', String(offset))

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
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
  const products: SitemapProduct[] = []
  const seenIds = new Set<string>()
  let offset = 0
  let stoppedForCap = false

  try {
    while (products.length < SITEMAP_MAX_URLS) {
      const page = await fetchCanonicalProductsPage(baseUrl, offset)
      if (page.items.length === 0) break

      for (const item of page.items) {
        const product = readCanonicalProduct(item)
        if (!product || seenIds.has(product.id)) continue
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
    source: stoppedForCap ? 'serving_eligible_truncated' : 'serving_eligible',
  }
}

export async function GET() {
  const { products, source } = await collectServingEligibleProducts()

  const urls = products.map((product) => ({
    loc: `${SITEMAP_BASE_URL}/products/${encodeURIComponent(product.id)}`,
    lastmod: product.lastmod,
    changefreq: 'weekly',
  }))

  const xml = buildSitemapXml(urls)

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
