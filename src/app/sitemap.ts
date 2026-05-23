import { MetadataRoute } from 'next'
import { SITEMAP_BASE_URL } from './sitemap-seeds'

// Product PDP URLs live in /sitemap-products.xml; robots.ts advertises
// both files because Next MetadataRoute.Sitemap emits a urlset, not an index.
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [
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
}
