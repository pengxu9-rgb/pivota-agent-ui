import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/order/', '/api/'],
    },
    sitemap: 'https://agent.pivota.cc/sitemap.xml',
  }
}
