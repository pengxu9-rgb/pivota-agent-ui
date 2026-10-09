// THE LOCATED-MARKET COOKIE RULE (src/lib/buyerMarket.ts, "2. the buyer's LOCATION").
// Pure functions the middleware applies; kept out of middleware.ts so they can be
// imported by a test without Next's middleware module shape in the way.
import { normalizeBuyerMarket } from '@/lib/buyerMarket';

/** The located-market cookie lives this long; the LB re-states the region on every request anyway. */
export const LOCATED_MARKET_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** The dial: unset or anything but `off` is on. */
export function locationMarketEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.BUYER_MARKET_FROM_LOCATION || '').trim().toLowerCase() !== 'off';
}

/**
 * What the located-market cookie should be after this request: a priceable market to
 * SET, `null` to CLEAR (the LB named a region the gateway does not price, or the dial is
 * off), or `undefined` to leave the cookie untouched (no header: not behind the LB).
 */
export function locatedMarketUpdate(
  headerValue: string | null,
  currentCookie: string | undefined,
  enabled: boolean,
): string | null | undefined {
  if (!enabled) return currentCookie === undefined ? undefined : null;
  if (headerValue === null) return undefined;
  const market = normalizeBuyerMarket(headerValue);
  if (market === null) return currentCookie === undefined ? undefined : null;
  return market === currentCookie ? undefined : market;
}
