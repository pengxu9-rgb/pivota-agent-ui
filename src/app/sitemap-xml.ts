export type SitemapUrlEntry = {
  loc: string
  lastmod?: Date
  changefreq?: string
  priority?: number
}

export type SitemapIndexEntry = {
  loc: string
  lastmod?: Date
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function buildSitemapUrlsetXml(urls: ReadonlyArray<SitemapUrlEntry>): string {
  const entries = urls
    .map((e) => {
      const fields = [
        `    <loc>${escapeXml(e.loc)}</loc>`,
        e.lastmod ? `    <lastmod>${e.lastmod.toISOString()}</lastmod>` : null,
        e.changefreq ? `    <changefreq>${escapeXml(e.changefreq)}</changefreq>` : null,
        typeof e.priority === 'number' ? `    <priority>${e.priority}</priority>` : null,
      ].filter(Boolean)

      return `  <url>\n${fields.join('\n')}\n  </url>`
    })
    .join('\n')

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${entries}\n` +
    `</urlset>\n`
  )
}

export function buildSitemapIndexXml(sitemaps: ReadonlyArray<SitemapIndexEntry>): string {
  const entries = sitemaps
    .map((e) => {
      const fields = [
        `    <loc>${escapeXml(e.loc)}</loc>`,
        e.lastmod ? `    <lastmod>${e.lastmod.toISOString()}</lastmod>` : null,
      ].filter(Boolean)

      return `  <sitemap>\n${fields.join('\n')}\n  </sitemap>`
    })
    .join('\n')

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${entries}\n` +
    `</sitemapindex>\n`
  )
}
