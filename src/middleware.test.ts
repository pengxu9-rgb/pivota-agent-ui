// Two edge jobs: the 410 boundary for retired sigs, and the located-market cookie
// written from the load balancer's X-Client-Region header (choice > located > US,
// src/lib/buyerMarket.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../public/retired-sigs.json', () => ({
  default: { sigs: ['sig_retired1'] },
}));

import { config, middleware } from './middleware';
import { locatedMarketUpdate, locationMarketEnabled } from '@/lib/locatedMarket';

function req(pathname: string, { region, cookie, https = true }: { region?: string; cookie?: string; https?: boolean } = {}) {
  const headers = new Headers();
  if (region !== undefined) headers.set('x-client-region', region);
  if (cookie !== undefined) headers.set('cookie', cookie);
  return new NextRequest(`${https ? 'https' : 'http'}://agent.pivota.cc${pathname}`, { headers });
}

/** The located-market Set-Cookie on a response, parsed, or null when none was written. */
function locatedCookie(res: Response): { value: string; maxAge: number | null; secure: boolean; httpOnly: boolean } | null {
  const raw = res.headers.get('set-cookie');
  if (!raw) return null;
  const line = raw.split(/,(?=\s*[^;,]+=)/).find((c) => c.trim().startsWith('pv_located_market='));
  if (!line) return null;
  const parts = line.split(';').map((p) => p.trim());
  const maxAge = parts.find((p) => /^max-age=/i.test(p));
  return {
    value: parts[0].slice('pv_located_market='.length),
    maxAge: maxAge ? Number(maxAge.split('=')[1]) : null,
    secure: parts.some((p) => /^secure$/i.test(p)),
    httpOnly: parts.some((p) => /^httponly$/i.test(p)),
  };
}

describe('retired-sig middleware', () => {
  it('answers 410 for a retired sig with a cacheable HTML body', async () => {
    const res = middleware(req('/products/sig_retired1'));
    expect(res.status).toBe(410);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).toContain('s-maxage');
    expect(await res.text()).toContain('retired');
  });

  it('passes live sigs, alias routes, and the listing through', () => {
    expect(middleware(req('/products/sig_live')).status).toBe(200);
    expect(middleware(req('/products/m/sig_retired1')).status).toBe(200);
    expect(middleware(req('/products')).status).toBe(200);
  });

  it('does not 410 a deeper path that never existed', () => {
    expect(middleware(req('/products/sig_retired1/reviews')).status).toBe(200);
  });

  it('does not 410 a retired sig under another prefix now that the matcher is site-wide', () => {
    expect(middleware(req('/orders/sig_retired1')).status).toBe(200);
    expect(middleware(req('/sig_retired1/x')).status).toBe(200);
  });

  it('keeps the browser cache purgeable', () => {
    const cc = middleware(req('/products/sig_retired1')).headers.get('cache-control');
    expect(cc).toContain('s-maxage=');
    expect(cc).toContain('max-age=0');
  });

  it('the matcher covers every page and API path, and skips Next assets and files', () => {
    const [pattern] = config.matcher;
    const re = new RegExp(`^${pattern.replace(/\(\?!/g, '(?!')}$`);
    for (const p of ['/', '/products', '/products/sig_x', '/orders', '/api/gateway', '/brands/foo']) {
      expect(re.test(p), p).toBe(true);
    }
    for (const p of ['/_next/static/chunk.js', '/_next/image', '/favicon.ico', '/robots.txt', '/sitemap.xml']) {
      expect(re.test(p), p).toBe(false);
    }
  });
});

describe('the located-market cookie (X-Client-Region -> pv_located_market)', () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.unstubAllEnvs());

  it('a priceable region is written, readable by the browser, secure on https, for 30 days', () => {
    const res = middleware(req('/products', { region: 'SG' }));
    expect(res.status).toBe(200);
    expect(locatedCookie(res)).toEqual({ value: 'SG', maxAge: 60 * 60 * 24 * 30, secure: true, httpOnly: false });
  });

  it('Secure is forced in production even on the plain-http last hop behind the load balancer', () => {
    expect(locatedCookie(middleware(req('/', { region: 'SG', https: false })))?.secure).toBe(false);
    vi.stubEnv('NODE_ENV', 'production');
    expect(locatedCookie(middleware(req('/', { region: 'SG', https: false })))?.secure).toBe(true);
  });

  it('the region is normalised to the gateway spelling, and an unchanged cookie is not rewritten', () => {
    expect(locatedCookie(middleware(req('/', { region: 'jp' })))?.value).toBe('JP');
    expect(locatedCookie(middleware(req('/', { region: 'JP', cookie: 'pv_located_market=JP' })))).toBeNull();
    expect(locatedCookie(middleware(req('/', { region: 'SG', cookie: 'pv_located_market=JP' })))?.value).toBe('SG');
  });

  it('no header (not behind the LB) leaves the cookie alone, with or without one present', () => {
    expect(locatedCookie(middleware(req('/')))).toBeNull();
    expect(locatedCookie(middleware(req('/', { cookie: 'pv_located_market=JP' })))).toBeNull();
  });

  it('a region the gateway does not price CLEARS a stale cookie and never writes one', () => {
    for (const region of ['ZZ', 'DE', 'UK', 'T1', '', 'en-US']) {
      expect(locatedCookie(middleware(req('/', { region }))), region).toBeNull();
      const cleared = locatedCookie(middleware(req('/', { region, cookie: 'pv_located_market=JP' })));
      expect(cleared?.value, region).toBe('');
      expect(cleared?.maxAge, region).toBe(0);
    }
  });

  it('the 410 answer carries no cookie: it is a cached document for everyone', () => {
    expect(locatedCookie(middleware(req('/products/sig_retired1', { region: 'SG' })))).toBeNull();
  });

  it('the dial: BUYER_MARKET_FROM_LOCATION=off writes nothing and clears what is there', () => {
    expect(locationMarketEnabled({})).toBe(true);
    expect(locationMarketEnabled({ BUYER_MARKET_FROM_LOCATION: 'on' })).toBe(true);
    expect(locationMarketEnabled({ BUYER_MARKET_FROM_LOCATION: ' OFF ' })).toBe(false);
    vi.stubEnv('BUYER_MARKET_FROM_LOCATION', 'off');
    expect(locatedCookie(middleware(req('/', { region: 'SG' })))).toBeNull();
    const cleared = locatedCookie(middleware(req('/', { region: 'SG', cookie: 'pv_located_market=SG' })));
    expect(cleared?.maxAge).toBe(0);
  });

  it('locatedMarketUpdate: the whole table', () => {
    // enabled
    expect(locatedMarketUpdate('SG', undefined, true)).toBe('SG');
    expect(locatedMarketUpdate('sg', 'JP', true)).toBe('SG');
    expect(locatedMarketUpdate('SG', 'SG', true)).toBeUndefined();
    expect(locatedMarketUpdate(null, undefined, true)).toBeUndefined();
    expect(locatedMarketUpdate(null, 'SG', true)).toBeUndefined();
    expect(locatedMarketUpdate('ZZ', undefined, true)).toBeUndefined();
    expect(locatedMarketUpdate('ZZ', 'SG', true)).toBeNull();
    // disabled
    expect(locatedMarketUpdate('SG', undefined, false)).toBeUndefined();
    expect(locatedMarketUpdate('SG', 'SG', false)).toBeNull();
    expect(locatedMarketUpdate(null, 'SG', false)).toBeNull();
  });
});
