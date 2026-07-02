import { NextResponse } from 'next/server'
import { staticSitemapEntries } from '../sitemap-routes'
import { buildSitemapUrlsetXml } from '../sitemap-xml'

export const revalidate = 3600

// Static route list — near-static content, but still cold-starts when the edge
// cache expires. Cache long + stale-while-revalidate so a crawler fetch never
// blocks on a cold start (the root cause of GSC "Couldn't fetch"). max-age is the
// (irrelevant) browser TTL; crawlers always revalidate.
const CACHE_CONTROL =
  `public, max-age=${revalidate}, s-maxage=86400, stale-while-revalidate=604800`

export async function GET() {
  const xml = buildSitemapUrlsetXml(staticSitemapEntries())

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
