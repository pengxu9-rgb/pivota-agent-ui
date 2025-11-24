import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: 'GPTBot',
        allow: ['/', '/products/', '/products', '/api/catalog', '/api/catalog/'],
        disallow: ['/order/'],
      },
      {
        userAgent: 'ClaudeBot',
        allow: ['/', '/products/', '/products', '/api/catalog', '/api/catalog/'],
        disallow: ['/order/'],
      },
      {
        userAgent: 'PerplexityBot',
        allow: ['/', '/products/', '/products', '/api/catalog', '/api/catalog/'],
        disallow: ['/order/'],
      },
      {
        userAgent: 'Google-Extended',
        allow: ['/', '/products/', '/products', '/api/catalog', '/api/catalog/'],
        disallow: ['/order/'],
      },
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/order/'],
      },
    ],
    sitemap: 'https://agent.pivota.cc/sitemap.xml',
  }
}

