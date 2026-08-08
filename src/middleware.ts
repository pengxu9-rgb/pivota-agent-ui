/**
 * HTTP 410 Gone for deliberately retired product pages.
 *
 * WHY MIDDLEWARE (2026-08-08 audit): a retired sig's PDP answered the same
 * bare 404 as a typo, so engines kept re-trying dead URLs and Search Console
 * accumulated 404 churn (62 URLs left the sitemap in one refresh alone). An
 * RSC page has no API for a non-404 status — notFound() is the only status
 * lever — and this route's ISR contract (products/[id]/page.tsx) forbids
 * dynamic APIs, so middleware is the one place a 410 can be emitted.
 *
 * The retired set is a build-time import of public/retired-sigs.json, which
 * the sitemap refresh workflow maintains (generate_sitemaps.mjs): a sig lands
 * there only when it was previously advertised AND has left the canonical
 * feed entirely — dedup losers whose content_key still serves stay 200 with
 * their canonical pointing at the keeper. The file updating triggers the same
 * push-to-main deploy the sitemaps already ride, so set and bundle move
 * together.
 *
 * Everything else falls through untouched: NextResponse.next() preserves the
 * beforeFiles merchant rewrite in next.config.mjs (middleware runs first).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import retiredSigs from '../public/retired-sigs.json';

const RETIRED = new Set<string>(
  Array.isArray((retiredSigs as { sigs?: unknown }).sigs)
    ? ((retiredSigs as { sigs: unknown[] }).sigs.filter(
        (s): s is string => typeof s === 'string' && s.startsWith('sig_'),
      ))
    : [],
);

const GONE_BODY = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Product retired</title><meta name="robots" content="noindex"></head><body><h1>410 — this product was retired</h1><p>This page was deliberately removed and will not return. Browse the catalog at <a href="/products">/products</a>.</p></body></html>`;

export function middleware(request: NextRequest) {
  const segments = request.nextUrl.pathname.split('/');
  // /products/<sig> → segments[2]; alias routes (/products/m/<id>) and the
  // listing itself never match a sig_ entry.
  const candidate = segments[2] || '';
  if (RETIRED.has(candidate)) {
    return new NextResponse(GONE_BODY, {
      status: 410,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Cacheable at the CDN: retirement is permanent by definition, and a
        // resurrected sig leaves the set only via a deploy, which purges this.
        'Cache-Control': 'public, s-maxage=86400, max-age=3600',
      },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/products/:path*',
};
