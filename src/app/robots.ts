import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: 'GPTBot',
        allow: ['/', '/products/', '/products', '/openapi.json', '/.well-known/', '/.well-known/ai-plugin.json'],
        disallow: ['/order/'],
      },
      {
        userAgent: 'ClaudeBot',
        allow: ['/', '/products/', '/products', '/openapi.json', '/.well-known/', '/.well-known/ai-plugin.json'],
        disallow: ['/order/'],
      },
      {
        userAgent: 'PerplexityBot',
        allow: ['/', '/products/', '/products', '/openapi.json', '/.well-known/', '/.well-known/ai-plugin.json'],
        disallow: ['/order/'],
      },
      {
        userAgent: 'Google-Extended',
        allow: ['/', '/products/', '/products', '/openapi.json', '/.well-known/', '/.well-known/ai-plugin.json'],
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
