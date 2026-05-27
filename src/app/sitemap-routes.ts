import { SITEMAP_BASE_URL } from './sitemap-seeds'
import type { SitemapIndexEntry, SitemapUrlEntry } from './sitemap-xml'

// We deliberately omit <lastmod> for these entries.
//
// Per Google's 2023 lastmod-validation policy, an inaccurate lastmod
// causes the entire sitemap to be deprioritized as a freshness signal.
// We do not track real "last content change" for the homepage or the
// /products grid, and we do not track a real lastmod for the index
// itself — each child sitemap carries its own. A missing <lastmod>
// is a trusted "unknown" signal; a fabricated `new Date()` is not.

export function staticSitemapEntries(): SitemapUrlEntry[] {
  return [
    {
      loc: SITEMAP_BASE_URL,
      changefreq: 'daily',
      priority: 1,
    },
    {
      loc: `${SITEMAP_BASE_URL}/products`,
      changefreq: 'daily',
      priority: 0.9,
    },
  ]
}

export function sitemapIndexEntries(): SitemapIndexEntry[] {
  return [
    { loc: `${SITEMAP_BASE_URL}/sitemap-static.xml` },
    { loc: `${SITEMAP_BASE_URL}/sitemap-products.xml` },
  ]
}
