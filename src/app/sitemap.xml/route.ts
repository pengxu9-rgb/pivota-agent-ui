import { NextResponse } from 'next/server'
import { sitemapIndexEntries } from '../sitemap-routes'
import { buildSitemapIndexXml } from '../sitemap-xml'

export const revalidate = 3600

// The index is near-static (just references the child sitemaps) but still pays a
// serverless cold-start when the edge cache expires. Cache it long and serve
// stale-while-revalidate so a crawler fetch never blocks on a cold start — the
// root cause of GSC "Couldn't fetch". max-age is the (irrelevant) browser TTL.
const CACHE_CONTROL =
  `public, max-age=${revalidate}, s-maxage=86400, stale-while-revalidate=604800`

export async function GET() {
  const xml = buildSitemapIndexXml(sitemapIndexEntries())

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': CACHE_CONTROL,
    },
  })
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': CACHE_CONTROL,
    },
  })
}
