import { NextResponse } from 'next/server'
import { sitemapIndexEntries } from '../sitemap-routes'
import { buildSitemapIndexXml } from '../sitemap-xml'

export const revalidate = 3600

const CACHE_CONTROL =
  `public, max-age=${revalidate}, s-maxage=${revalidate}, stale-while-revalidate=${revalidate}`

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
