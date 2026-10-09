/**
 * Two edge jobs, one middleware:
 *
 * 1. HTTP 410 Gone for deliberately retired product pages (unchanged, 2026-08-08).
 * 2. The buyer's LOCATED MARKET, read from the load balancer's `X-Client-Region`
 *    header into the `pv_located_market` cookie (2026-10-09, src/lib/buyerMarket.ts:
 *    precedence choice > located > storefront). The header is the client's country
 *    as GCP sees it (CLDR region code), set only by the LB (`pivota-bes-agent`,
 *    custom request header `X-Client-Region:{client_region}`); a request that does
 *    not carry it (local dev, a direct hit) leaves the cookie alone. A region this
 *    storefront does not SERVE -- unpriceable (ZZ, DE, ...) or priceable with no
 *    catalogue (SG, JP, ... see SERVED_MARKETS) -- CLEARS the cookie, so a buyer who
 *    moved there is served the storefront market, not a stale one or an empty page. The
 *    cookie is NOT httpOnly: the browser's own gateway calls read it. One dial,
 *    `BUYER_MARKET_FROM_LOCATION` (unset = on; `off` disables the write and clears
 *    the cookie), so the location layer can be switched off without a deploy of code.
 *
 * WHY MIDDLEWARE for the 410 (2026-08-08 audit): a retired sig's PDP answered the same
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
import { CLIENT_REGION_HEADER, LOCATED_MARKET_COOKIE } from '@/lib/buyerMarket';
import { LOCATED_MARKET_COOKIE_MAX_AGE_SECONDS, locatedMarketUpdate, locationMarketEnabled } from '@/lib/locatedMarket';

const RETIRED = new Set<string>(
  Array.isArray((retiredSigs as { sigs?: unknown }).sigs)
    ? ((retiredSigs as { sigs: unknown[] }).sigs.filter(
        (s): s is string => typeof s === 'string' && s.startsWith('sig_'),
      ))
    : [],
);

const GONE_BODY = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Product retired</title><meta name="robots" content="noindex"></head><body><h1>410 — this product was retired</h1><p>This page was deliberately removed and will not return. Browse the catalog at <a href="/products">/products</a>.</p></body></html>`;

export function middleware(request: NextRequest) {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  // EXACTLY /products/<sig>. Anything deeper (/products/<sig>/reviews) is a URL
  // that never existed and must keep 404-ing, not inherit a permanent 410;
  // alias routes (/products/m/<id>) and the listing never match a sig_ entry.
  // The matcher is wider than /products now (the cookie below is for every page),
  // so the path prefix is checked here too.
  const candidate = segments.length === 2 && segments[0] === 'products' ? segments[1] : '';
  if (RETIRED.has(candidate)) {
    return new NextResponse(GONE_BODY, {
      status: 410,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // CDN-cacheable, but deliberately max-age=0 for the browser: a deploy
        // purges the shared cache, so a mistaken 410 is recoverable there —
        // whereas a browser max-age is a client-side directive NO deploy can
        // reach, which would strand the error for its full lifetime.
        'Cache-Control': 'public, s-maxage=86400, max-age=0, must-revalidate',
      },
    });
  }

  // ⚠️ A Set-Cookie on an ISR page response. Today the page is served by this Next server with no
  // shared cache in front of it, so the cookie is per request. If Cloud CDN (or any shared cache)
  // is ever put in front of agent.pivota.cc, a cached response would replay ONE buyer's
  // Set-Cookie to everyone behind it; the cache key or Vary would have to carry X-Client-Region,
  // or this write would have to move off cacheable responses.
  const response = NextResponse.next();
  const update = locatedMarketUpdate(
    request.headers.get(CLIENT_REGION_HEADER),
    request.cookies.get(LOCATED_MARKET_COOKIE)?.value,
    locationMarketEnabled(),
  );
  if (update === null) {
    response.cookies.set(LOCATED_MARKET_COOKIE, '', { path: '/', maxAge: 0, sameSite: 'lax' });
  } else if (typeof update === 'string') {
    response.cookies.set(LOCATED_MARKET_COOKIE, update, {
      path: '/',
      maxAge: LOCATED_MARKET_COOKIE_MAX_AGE_SECONDS,
      sameSite: 'lax',
      // Behind the load balancer this server sees plain http on the last hop, so the request's
      // own scheme says nothing about the buyer's: in production the flag is forced.
      secure: process.env.NODE_ENV === 'production' || request.nextUrl.protocol === 'https:',
      // Readable by the browser's own gateway calls (src/lib/buyerMarket.ts), so not httpOnly.
      httpOnly: false,
    });
  }
  return response;
}

export const config = {
  // Every page and API request, so the located-market cookie is set wherever the
  // buyer lands — but not Next's own assets or files with an extension, which
  // never read a cookie and would pay for the check on every byte.
  matcher: ['/((?!_next/|.*\\..*).*)'],
};
