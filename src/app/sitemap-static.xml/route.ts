import { NextResponse } from 'next/server'
import { staticSitemapEntries } from '../sitemap-routes'
import { buildSitemapUrlsetXml } from '../sitemap-xml'

export const revalidate = 3600

const CACHE_CONTROL =
  `public, max-age=${revalidate}, s-maxage=${revalidate}, stale-while-revalidate=${revalidate}`

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
