// THE BUYER MARKET THIS STOREFRONT SENDS ON EVERY GATEWAY CALL.
//
// Why this exists (2026-09-27). The UI sent no buyer market at all -- only
// `metadata.scope.region`, parsed from navigator.language (and null on SSR). The
// gateway reads a buyer market from `search.market`, `payload.market` or
// `metadata.market` and never from `scope.region`, on purpose: a browser language
// is not where a buyer shops. So every call was a SILENT request. The gateway's
// rule for silence (PIVOTA-Agent docs/merchant-purchasability-gate.md, "One rule
// for a silent request"): it still SERVES the default-market catalogue, but it makes
// no purchase claim, because a purchasability fact is per (merchant, market) and a
// defaulted market is not the buyer's. With the purchasability gate armed and the
// backend enforcing, that declines every merchant on every PDP.
//
// Where the market comes from (2026-10-09, Peng: "serve multiple markets based on
// the user's location like we do for outside agents"; precedence "cookie > located
// > US"). Three declarations, in a fixed precedence, and the first one that names
// a market the gateway can price wins:
//
//   1. the buyer's own CHOICE   -- the `pv_market` cookie, written by the market
//                                  selector (MarketSelector). A person said so.
//   2. the buyer's LOCATION     -- the `pv_located_market` cookie, written by the
//                                  middleware from the load balancer's
//                                  `X-Client-Region` header (the country of the
//                                  client IP, as GCP sees it). The storefront
//                                  declares that it serves that buyer their own
//                                  market, exactly as the partner surfaces do with
//                                  `buyer_region`. Behind one dial
//                                  (`BUYER_MARKET_FROM_LOCATION`, middleware).
//   3. the STOREFRONT market    -- `US`. agent.pivota.cc's base market: every
//                                  server-rendered page is priced in USD, and a
//                                  buyer nobody could place is served it.
//
// A caller's own `metadata.market` (a surface that knows better, e.g. a checkout
// hand-off carrying the buyer's market) still sits above all three.
//
// Why this is a DECLARATION and not the forbidden default (pivota-backend
// docs/runbooks/merchant_purchasability.md, "A declared storefront market is a
// market; a per-request fallback is not"). "Never default a market" forbids a
// door downstream GUESSING on a caller's behalf. This storefront OWNS the buyer
// relationship: it decides which market it serves this person in, states it on
// every call, and the gateway keys on it. The location is read once, at the edge,
// from a header only the load balancer sets -- never from the browser language,
// never from a geo-IP lookup made inside a door.
//
// What the gateway accepts. Exactly ONE ISO-3166 alpha-2 code the gateway can price
// (`resolveServingCurrency`: US -> USD). Anything else -- a locale ('en-US'), a list
// ('US,SG'), or a well-formed code it has no currency for ('UK', 'DE', 'ZZ') -- is
// read as "a market nothing is priced for" and the search serves NOTHING, so this
// module never sends one: a value outside PRICEABLE_MARKETS, from ANY of the sources
// above, is skipped and the next source decides.
//
// PRICEABLE IS NOT SERVED (2026-10-09, the hour #415 was live). A market the gateway
// can PRICE is not a market it has a CATALOGUE for: keyed to SG, the browse feed
// returned 0 of 3,222 rows (every row is USD and the gateway's serving_currency_guard
// drops them for an SG buyer), and the same for all 11 non-US priceable markets. So
// the LOCATED declaration -- the one the buyer did not make -- only ever names a
// market in SERVED_MARKETS, the measured set of markets with a non-empty browse feed.
// A buyer located anywhere else is served the storefront market. The buyer's own
// CHOICE is still any priceable market: a person who picks SG gets SG, empty page and
// all, by their own hand, and can switch back. A market joins SERVED_MARKETS only once
// its feed is measured non-empty through the real door (gateway work, "(c)").
//
// Server-rendered pages (ISR) read no cookie and stay on the storefront market: an
// ISR page is one document for everyone, and its contract forbids the dynamic APIs
// a cookie read needs. The browser's own calls re-key to the buyer's market.

export const STOREFRONT_MARKET = 'US';

// The markets the gateway prices, mirrored from PIVOTA-Agent
// src/auroraBff/buyerRegion.js `currencyForBuyerRegion` (2026-09-27). A market added
// there is not sendable from here until it is added here too -- the safe direction:
// it falls back to the storefront market instead of emptying the page.
export const PRICEABLE_MARKETS: ReadonlySet<string> = new Set([
  'AU', 'CA', 'FI', 'FR', 'GB', 'HK', 'HR', 'JP', 'KR', 'SE', 'SG', 'US',
]);

// The markets with a browse catalogue, measured through agent.pivota.cc's own proxy
// (get_discovery_feed, surface browse_products) on 2026-10-09: US 20 of 24 rows served;
// AU CA FI FR GB HK HR JP KR SE SG 0 (serving_currency_guard dropped every USD row).
// The LOCATED layer declares only these. Always a subset of PRICEABLE_MARKETS (pinned).
export const SERVED_MARKETS: ReadonlySet<string> = new Set(['US']);

/** Labels for the selector, one per priceable market. */
export const MARKET_LABELS: Readonly<Record<string, string>> = {
  AU: 'Australia',
  CA: 'Canada',
  FI: 'Finland',
  FR: 'France',
  GB: 'United Kingdom',
  HK: 'Hong Kong',
  HR: 'Croatia',
  JP: 'Japan',
  KR: 'Korea',
  SE: 'Sweden',
  SG: 'Singapore',
  US: 'United States',
};

/** The buyer's own choice, written by the market selector. */
export const MARKET_CHOICE_COOKIE = 'pv_market';
/** The buyer's located market, written by the middleware from the edge header. */
export const LOCATED_MARKET_COOKIE = 'pv_located_market';
/** The load balancer's header: the client's country, as GCP sees it (CLDR region code). */
export const CLIENT_REGION_HEADER = 'x-client-region';

/** Which declaration decided the market. */
export type BuyerMarketSource = 'caller' | 'choice' | 'located' | 'storefront';

/** One market the gateway can price, upper-cased, or null. Never a locale, never a list. */
export function normalizeBuyerMarket(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return PRICEABLE_MARKETS.has(code) ? code : null;
}

/** One market this storefront SERVES (has a catalogue for), or null. What the located layer may declare. */
export function normalizeServedMarket(raw: unknown): string | null {
  const code = normalizeBuyerMarket(raw);
  return code !== null && SERVED_MARKETS.has(code) ? code : null;
}

/** A `Cookie` header (or `document.cookie`) as a name -> value map. The FIRST value for a name wins. */
export function parseCookieHeader(cookie: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof cookie !== 'string' || !cookie) return out;
  for (const part of cookie.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    if (!name || Object.prototype.hasOwnProperty.call(out, name)) continue;
    let value = part.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      // a value that is not URI-encoded is used as written
    }
    out[name] = value;
  }
  return out;
}

/**
 * The two market cookies: the choice is any priceable market, the located market only a
 * SERVED one (a stale cookie naming a priceable-but-unserved market reads as none).
 */
export function readMarketCookies(cookie: string | null | undefined): { choice: string | null; located: string | null } {
  const jar = parseCookieHeader(cookie);
  return {
    choice: normalizeBuyerMarket(jar[MARKET_CHOICE_COOKIE]),
    located: normalizeServedMarket(jar[LOCATED_MARKET_COOKIE]),
  };
}

/** The browser's cookie jar, or null where there is no document (SSR). */
export function browserCookieHeader(): string | null {
  if (typeof document === 'undefined') return null;
  try {
    return document.cookie || null;
  } catch {
    return null;
  }
}

/**
 * The market for one gateway call, and which declaration decided it:
 * the caller's own market, then the buyer's choice, then the buyer's located market,
 * then the storefront market. `cookie` is the request's cookie jar; when it is not
 * given, the browser's own is read, and on the server (no document) there is none.
 */
export function resolveBuyerMarketDetailed(
  callerMarket?: unknown,
  cookie?: string | null,
): { market: string; source: BuyerMarketSource } {
  const caller = normalizeBuyerMarket(callerMarket);
  if (caller) return { market: caller, source: 'caller' };
  const jar = cookie === undefined ? browserCookieHeader() : cookie;
  const { choice, located } = readMarketCookies(jar);
  if (choice) return { market: choice, source: 'choice' };
  if (located) return { market: located, source: 'located' };
  return { market: STOREFRONT_MARKET, source: 'storefront' };
}

/**
 * The market for one gateway call: the caller's own `metadata.market` when it is a
 * single market the gateway can price, else the buyer's choice, else the buyer's
 * located market, else the storefront market.
 */
export function resolveBuyerMarket(callerMarket?: unknown, cookie?: string | null): string {
  return resolveBuyerMarketDetailed(callerMarket, cookie).market;
}

type GatewayEnvelope = { metadata?: unknown; [key: string]: unknown };

/**
 * The envelope with `metadata.market` set. For the gateway calls that do not go
 * through `callGateway` (server-rendered pages that POST `/api/gateway` directly).
 * Server-side there is no cookie jar, so this is the storefront market unless the
 * caller named one.
 */
export function withBuyerMarket<T extends GatewayEnvelope>(body: T): T & { metadata: Record<string, unknown> } {
  const metadata =
    body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : {};
  return { ...body, metadata: { ...metadata, market: resolveBuyerMarket(metadata.market) } };
}
