import { MetadataRoute } from 'next'
import { getAllProducts } from '@/lib/api'
import {
  SITEMAP_BASE_URL,
  SITEMAP_SEED_PRODUCT_IDS,
  isMerchantIndexable,
  isProductIdSitemapEligible,
} from './sitemap-seeds'

// Re-evaluate at most once per hour. Important so seeds added between
// builds (and dynamic-feed recoveries from transient API outages) ship
// to the next crawl without a full Vercel deploy.
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').trim()
  const canFetchProducts = /^https?:\/\//.test(apiBase)

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITEMAP_BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${SITEMAP_BASE_URL}/products`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITEMAP_BASE_URL}/order`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ]

  // Seeds are guaranteed-included regardless of API health.
  const seedProductPages: MetadataRoute.Sitemap = SITEMAP_SEED_PRODUCT_IDS
    .filter(isProductIdSitemapEligible)
    .map((id) => ({
      url: `${SITEMAP_BASE_URL}/products/${id}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    }))

  if (!canFetchProducts) {
    return [...staticPages, ...seedProductPages]
  }

  try {
    const products = await getAllProducts(200)

    // Stage 3b-1: dedupe by product_group_id when present. The
    // Tom Ford foundation cluster has 43 catalog_products rows under
    // one product_group; pre-3b the sitemap listed all 43 URLs and
    // Google had to dedupe at index time (which it does imperfectly
    // — sometimes the wrong sig becomes "canonical" per Search
    // Console). Emit one URL per group — the primary's sig is the
    // canonical PDP for that physical product.
    const seenGroupIds = new Set<string>()
    const seenUrls = new Set<string>()
    const dynamicProductPages: MetadataRoute.Sitemap = []
    for (const product of products) {
      if (!isProductIdSitemapEligible(product.product_id)) continue
      // Pre-submission filter: exclude test merchants whose PDPs
      // can't actually fulfill checkout. external_seed (referral
      // redirect) is intentionally indexable. MOYU and any future
      // test stores live in TEST_MERCHANT_IDS.
      if (!isMerchantIndexable(product.merchant_id)) continue
      // product.product_group_id is declared optional on ProductResponse
      // (src/lib/api.ts) so direct access works.
      const groupId = product.product_group_id
      if (groupId && seenGroupIds.has(groupId)) continue
      if (groupId) seenGroupIds.add(groupId)
      const url = `${SITEMAP_BASE_URL}/products/${product.product_id}`
      if (seenUrls.has(url)) continue
      seenUrls.add(url)
      // Stage 3b-1: use product.updated_at instead of new Date()
      // (which lied that every product was just modified). LLM
      // crawlers + Google use lastmod as a freshness signal — a
      // uniform "now" timestamp tells them nothing actually changed
      // recently, so they re-crawl less aggressively than warranted.
      //
      // updated_at isn't on the strict ProductResponse interface
      // (varies by backend); cast through unknown to read it
      // defensively without widening the public type.
      const productAny = product as unknown as Record<string, unknown>
      const updatedAtRaw =
        (productAny.updated_at as string | undefined) ||
        (productAny.last_modified as string | undefined)
      let lastModified: Date = new Date()
      if (updatedAtRaw) {
        const parsed = new Date(updatedAtRaw)
        if (!Number.isNaN(parsed.getTime())) lastModified = parsed
      }
      dynamicProductPages.push({
        url,
        lastModified,
        changeFrequency: 'weekly',
        priority: 0.8,
      })
    }

    // Merge seeds + dynamic, de-duped on URL.
    const mergedSeen = new Set<string>()
    const merged: MetadataRoute.Sitemap = []
    for (const entry of [...seedProductPages, ...dynamicProductPages]) {
      if (mergedSeen.has(entry.url)) continue
      mergedSeen.add(entry.url)
      merged.push(entry)
    }

    return [...staticPages, ...merged]
  } catch (error) {
    console.error(
      'Failed to build product sitemap from API, falling back to seeds + static pages:',
      error,
    )
    return [...staticPages, ...seedProductPages]
  }
}
