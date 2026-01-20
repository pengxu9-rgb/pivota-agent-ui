import { MetadataRoute } from 'next'
import { getAllProducts } from '@/lib/api'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://agent.pivota.cc'
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').trim()
  const canFetchProducts = /^https?:\/\//.test(apiBase)

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

  if (!canFetchProducts) {
    return staticPages
  }

  try {
    const products = await getAllProducts(200)
    const productPages: MetadataRoute.Sitemap = products.map((product) => ({
      url: `${baseUrl}/products/${product.product_id}`,
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
