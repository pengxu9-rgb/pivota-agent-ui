import { NextResponse } from 'next/server'
import { getAllProducts } from '@/lib/api'
import {
  SITEMAP_BASE_URL,
  SITEMAP_SEED_PRODUCT_IDS,
  isProductIdSitemapEligible,
} from '../sitemap-seeds'

/**
 * Products-only sitemap at `/sitemap-products.xml`.
 *
 * This is the URL submitted to Google Search Console for product PDPs.
 * Distinct from the main `/sitemap.xml` so the products feed can be
 * regenerated and inspected independently — and so a transient products
 * API outage doesn't take down the static-page sitemap.
 *
 * Per the pivota-pdp-indexing-discoverability runbook:
 *   - Includes only `sig_*` canonical PDP URLs (excludes `ext_*` aliases)
 *   - Includes the seed list (high-priority PDPs we want guaranteed indexed)
 *   - Includes dynamic registry products when available
 *   - De-dupes on URL
 *   - Returns Content-Type: application/xml
 *
 * This route runs at request time (revalidates every hour). If the
 * dynamic feed is unavailable, the seed list still ships — Google
 * will at least find the canonical baselines.
 */

export const revalidate = 3600

const DAY_MS = 24 * 60 * 60 * 1000

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
  priority: number
}>): string {
  const entries = urls
    .map(
      (e) =>
        `  <url>\n` +
        `    <loc>${escapeXml(e.loc)}</loc>\n` +
        `    <lastmod>${e.lastmod.toISOString()}</lastmod>\n` +
        `    <changefreq>${e.changefreq}</changefreq>\n` +
        `    <priority>${e.priority.toFixed(1)}</priority>\n` +
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

const PIVOTA_CANONICAL_PAGE_SIZE = 1000

/**
 * Pull every sig_* the pivota-backend canonical resolver knows about.
 * One page (1000) is enough for current scale; if we cross that bar
 * we'll add cursor-style pagination — for now any merchant ramp will
 * surface in monitoring before we hit 1000 onboarded SKUs.
 */
async function fetchCanonicalSigIds(): Promise<string[]> {
  const base = (
    process.env.PIVOTA_BACKEND_BASE_URL ||
    process.env.NEXT_PUBLIC_PIVOTA_BACKEND_BASE_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '')
  if (!/^https?:\/\//.test(base)) return []

  try {
    const res = await fetch(
      `${base}/api/canonical/products?limit=${PIVOTA_CANONICAL_PAGE_SIZE}&offset=0`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      },
    )
    if (!res.ok) return []
    const data: unknown = await res.json().catch(() => null)
    const items = Array.isArray((data as any)?.items) ? (data as any).items : []
    return items
      .map((item: any) => (typeof item?.sig_id === 'string' ? item.sig_id.trim() : ''))
      .filter((id: string) => Boolean(id))
      .filter(isProductIdSitemapEligible)
  } catch (error) {
    console.error(
      'sitemap-products.xml: canonical resolver fetch failed, continuing without it:',
      error,
    )
    return []
  }
}

async function collectProductIds(): Promise<{
  ids: string[]
  source: 'seeds' | 'seeds+dynamic' | 'seeds+canonical' | 'seeds+dynamic+canonical'
}> {
  const seeds = SITEMAP_SEED_PRODUCT_IDS.filter(isProductIdSitemapEligible)

  const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').trim()
  const canFetchProducts = /^https?:\/\//.test(apiBase)

  const [dynamicIds, canonicalSigIds] = await Promise.all([
    canFetchProducts
      ? getAllProducts(200)
          .then((products) =>
            products
              .map((p) => p.product_id)
              .filter((id): id is string => typeof id === 'string')
              .filter(isProductIdSitemapEligible),
          )
          .catch((error) => {
            console.error(
              'sitemap-products.xml: dynamic registry fetch failed, continuing without it:',
              error,
            )
            return [] as string[]
          })
      : Promise.resolve([] as string[]),
    fetchCanonicalSigIds(),
  ])

  // De-dupe; seeds first (highest priority), then registry, then canonical.
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of [...seeds, ...dynamicIds, ...canonicalSigIds]) {
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }

  const usedDynamic = canFetchProducts && dynamicIds.length > 0
  const usedCanonical = canonicalSigIds.length > 0
  const source: 'seeds' | 'seeds+dynamic' | 'seeds+canonical' | 'seeds+dynamic+canonical' =
    usedDynamic && usedCanonical
      ? 'seeds+dynamic+canonical'
      : usedDynamic
        ? 'seeds+dynamic'
        : usedCanonical
          ? 'seeds+canonical'
          : 'seeds'
  return { ids: out, source }
}

export async function GET() {
  const { ids, source } = await collectProductIds()

  const lastmod = new Date()
  const urls = ids.map((id) => ({
    loc: `${SITEMAP_BASE_URL}/products/${id}`,
    lastmod,
    changefreq: 'weekly',
    priority: 0.8,
  }))

  const xml = buildSitemapXml(urls)

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // Allow browser/CDN caches to hold the response for an hour;
      // crawlers normally re-fetch on a longer cadence anyway.
      'Cache-Control': `public, max-age=${revalidate}, stale-while-revalidate=60`,
      // Helpful for ops: shows whether the dynamic feed contributed or
      // we shipped seeds only on this request.
      'X-Pivota-Sitemap-Source': source,
      'X-Pivota-Sitemap-Url-Count': String(urls.length),
    },
  })
}
