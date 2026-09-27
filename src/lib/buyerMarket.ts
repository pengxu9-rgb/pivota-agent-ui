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
// Where the market comes from. agent.pivota.cc serves ONE market: every price it
// shows is the gateway's US catalogue, priced in USD, and there is no market
// selector and no account/shipping country to read before checkout. So the market
// the UI is serving the buyer in is a fact about this storefront, and it is stated
// here once, as a constant -- not inferred from the browser language, the IP, or a
// header. When a market selector (or a signed-in shipping country) exists, it
// replaces this constant; the call sites do not change.
//
// What the gateway accepts. Exactly ONE ISO-3166 alpha-2 code the gateway can price
// (`resolveServingCurrency`: US -> USD). A locale ('en-US') or a list ('US,SG') is
// read as "a market nothing is priced for" and the search serves NOTHING, so this
// module never sends either: a caller-supplied value that is not a single ISO-2 code
// is replaced by the storefront market, never forwarded.

export const STOREFRONT_MARKET = 'US';

const ISO2 = /^[A-Z]{2}$/;

/** One ISO-2 market, upper-cased, or null. Never a locale, never a list. */
export function normalizeBuyerMarket(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return ISO2.test(code) ? code : null;
}

/**
 * The market for one gateway call: the caller's own `metadata.market` when it is a
 * single ISO-2 code (a surface that knows better, e.g. a checkout hand-off that
 * carries the buyer's market), else the storefront market.
 */
export function resolveBuyerMarket(callerMarket?: unknown): string {
  return normalizeBuyerMarket(callerMarket) || STOREFRONT_MARKET;
}

type GatewayEnvelope = { metadata?: unknown; [key: string]: unknown };

/**
 * The envelope with `metadata.market` set. For the gateway calls that do not go
 * through `callGateway` (server-rendered pages that POST `/api/gateway` directly).
 */
export function withBuyerMarket<T extends GatewayEnvelope>(body: T): T & { metadata: Record<string, unknown> } {
  const metadata =
    body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : {};
  return { ...body, metadata: { ...metadata, market: resolveBuyerMarket(metadata.market) } };
}
