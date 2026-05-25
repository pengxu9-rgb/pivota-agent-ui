import { SITEMAP_BASE_URL } from './sitemap-seeds'
import type { SitemapIndexEntry, SitemapUrlEntry } from './sitemap-xml'

export function staticSitemapEntries(now = new Date()): SitemapUrlEntry[] {
  return [
    {
      loc: SITEMAP_BASE_URL,
      lastmod: now,
      changefreq: 'daily',
      priority: 1,
    },
    {
      loc: `${SITEMAP_BASE_URL}/products`,
      lastmod: now,
      changefreq: 'daily',
      priority: 0.9,
    },
  ]
}

export function sitemapIndexEntries(now = new Date()): SitemapIndexEntry[] {
  return [
    {
      loc: `${SITEMAP_BASE_URL}/sitemap-static.xml`,
      lastmod: now,
    },
    {
      loc: `${SITEMAP_BASE_URL}/sitemap-products.xml`,
      lastmod: now,
    },
  ]
}
