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
      // PerplexityBot intentionally NOT singled out as a partner.
      // Multi-LLM channel scope is ChatGPT + Gemini + Claude only
      // (Perplexity low usage 2026). PerplexityBot can still crawl
      // under the catch-all `User-agent: *` allow rule below; we
      // just don't waste a dedicated rule on it.
      // Stage 3b-1 (2026-05-12).
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
