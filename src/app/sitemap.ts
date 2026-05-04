import { MetadataRoute } from 'next'
import { getIndexableProductSitemapUrls } from '@/app/products/[id]/pdpSeo'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://agent.pivota.cc'
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/products`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/order`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ]

  try {
    const productUrls = await getIndexableProductSitemapUrls(200)
    const productPages: MetadataRoute.Sitemap = productUrls.map((url) => ({
      url,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    }))

    return [...staticPages, ...productPages]
  } catch (error) {
    console.error(
      'Failed to build product sitemap from API, falling back to static pages:',
      error,
    )
    return staticPages
  }
}
