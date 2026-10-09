// @vitest-environment node
import { describe, expect, it } from 'vitest';

// CHOICE > LOCATED > STOREFRONT, as a pure function of a cookie jar. The browser
// and SSR paths are covered in api.buyerMarket.test.ts / buyerMarket.ssr.test.ts;
// this file pins the rule itself, with no document in scope.

import {
  LOCATED_MARKET_COOKIE,
  MARKET_CHOICE_COOKIE,
  MARKET_LABELS,
  PRICEABLE_MARKETS,
  SERVED_MARKETS,
  normalizeServedMarket,
  parseCookieHeader,
  readMarketCookies,
  resolveBuyerMarket,
  resolveBuyerMarketDetailed,
  withBuyerMarket,
} from './buyerMarket';

describe('resolveBuyerMarketDetailed: the precedence table', () => {
  const rows: Array<[string, unknown, string | null, { market: string; source: string }]> = [
    ['nothing at all', undefined, null, { market: 'US', source: 'storefront' }],
    ['empty jar', undefined, '', { market: 'US', source: 'storefront' }],
    ['located only (a served market)', undefined, 'pv_located_market=US', { market: 'US', source: 'located' }],
    // PRICEABLE IS NOT SERVED: a located SG buyer (priceable, no catalogue) is served the storefront market.
    ['located SG: priceable but not served -> storefront', undefined, 'pv_located_market=SG', { market: 'US', source: 'storefront' }],
    ['located JP: priceable but not served -> storefront', undefined, 'pv_located_market=JP', { market: 'US', source: 'storefront' }],
    ['choice only', undefined, 'pv_market=SG', { market: 'SG', source: 'choice' }],
    ['choice beats located', undefined, 'pv_located_market=US; pv_market=sg', { market: 'SG', source: 'choice' }],
    ['caller beats both', 'gb', 'pv_located_market=US; pv_market=SG', { market: 'GB', source: 'caller' }],
    ['unpriceable caller is skipped', 'en-US', 'pv_market=SG', { market: 'SG', source: 'choice' }],
    ['unpriceable choice is skipped', undefined, 'pv_market=DE; pv_located_market=US', { market: 'US', source: 'located' }],
    ['unpriceable located is skipped', undefined, 'pv_located_market=ZZ', { market: 'US', source: 'storefront' }],
    ['a list is not a market', undefined, 'pv_market=US,SG; pv_located_market=US', { market: 'US', source: 'located' }],
    ['lower-case and padded values are normalised', undefined, 'pv_located_market= us ', { market: 'US', source: 'located' }],
    ['other cookies are ignored', undefined, 'theme=dark; pv_market_x=SG; xpv_market=SG', { market: 'US', source: 'storefront' }],
  ];
  for (const [label, caller, jar, expected] of rows) {
    it(label, () => {
      expect(resolveBuyerMarketDetailed(caller, jar)).toEqual(expected);
      expect(resolveBuyerMarket(caller, jar)).toBe(expected.market);
    });
  }

  it('on the server (no document) and no jar given, there is no cookie source: the storefront market', () => {
    expect(typeof document).toBe('undefined');
    expect(resolveBuyerMarketDetailed()).toEqual({ market: 'US', source: 'storefront' });
    expect(withBuyerMarket({ operation: 'x' }).metadata.market).toBe('US');
    expect(withBuyerMarket({ operation: 'x', metadata: { market: 'sg' } }).metadata.market).toBe('SG');
  });
});

describe('the cookie jar', () => {
  it('parseCookieHeader: first value wins, values are URI-decoded, junk is skipped', () => {
    expect(parseCookieHeader('a=1; b=%20x%20; a=2; =nope; novalue; c=')).toEqual({ a: '1', b: ' x ', c: '' });
    expect(parseCookieHeader('bad=%E0%A4%A')).toEqual({ bad: '%E0%A4%A' });
    expect(parseCookieHeader(null)).toEqual({});
    expect(parseCookieHeader(undefined)).toEqual({});
  });
  it('readMarketCookies reads exactly the two names: the choice any priceable market, the located only a served one', () => {
    expect(MARKET_CHOICE_COOKIE).toBe('pv_market');
    expect(LOCATED_MARKET_COOKIE).toBe('pv_located_market');
    expect(readMarketCookies('pv_market=sg; pv_located_market=us')).toEqual({ choice: 'SG', located: 'US' });
    expect(readMarketCookies('pv_market=sg; pv_located_market=jp')).toEqual({ choice: 'SG', located: null });
    expect(readMarketCookies('pv_market=DE')).toEqual({ choice: null, located: null });
  });

  it('SERVED_MARKETS is a subset of PRICEABLE_MARKETS, holds US, and normalizeServedMarket admits exactly it', () => {
    expect(SERVED_MARKETS.size).toBeGreaterThan(0);
    for (const m of SERVED_MARKETS) expect(PRICEABLE_MARKETS.has(m), m).toBe(true);
    expect(SERVED_MARKETS.has('US')).toBe(true);
    for (const m of PRICEABLE_MARKETS) {
      expect(normalizeServedMarket(m.toLowerCase()), m).toBe(SERVED_MARKETS.has(m) ? m : null);
    }
    for (const junk of ['ZZ', 'DE', 'en-US', 'US,SG', '', null, 7]) expect(normalizeServedMarket(junk)).toBeNull();
  });
  it('every priceable market has a label, and nothing else does', () => {
    expect(Object.keys(MARKET_LABELS).sort()).toEqual([...PRICEABLE_MARKETS].sort());
  });
});
