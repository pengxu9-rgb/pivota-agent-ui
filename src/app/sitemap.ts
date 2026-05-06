import { MetadataRoute } from 'next'
import { getAllProducts } from '@/lib/api'
import {
  SITEMAP_BASE_URL,
  SITEMAP_SEED_PRODUCT_IDS,
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
    const dynamicProductPages: MetadataRoute.Sitemap = products
      .filter((product) => isProductIdSitemapEligible(product.product_id))
      .map((product) => ({
        url: `${SITEMAP_BASE_URL}/products/${product.product_id}`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.8,
      }))

    // Merge seeds + dynamic, de-duped on URL.
    const seenUrls = new Set<string>()
    const merged: MetadataRoute.Sitemap = []
    for (const entry of [...seedProductPages, ...dynamicProductPages]) {
      if (seenUrls.has(entry.url)) continue
      seenUrls.add(entry.url)
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
