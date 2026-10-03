// THE REAP CHECKOUT DEMO SWITCHES. Both default OFF, and both must be on.
//
//   NEXT_PUBLIC_REAP_CHECKOUT_DEMO   client: renders the "Checkout with Reap" entry at all. Off = the PDP
//                                    renders exactly what it renders today and makes no extra request.
//   REAP_CHECKOUT_DEMO_ENABLED       server: the /api/reap-checkout routes answer at all. Off = 404,
//                                    whatever a client sends. A client flag is a build-time constant
//                                    anyone can flip in their own browser; this is the one that counts.
//
// Truthy spellings are an ALLOWLIST (1, true, on, yes), so a typo cannot arm it.
//
// Which merchants show the entry: REAP_CHECKOUT_DEMO_MERCHANTS, a comma list of `domain:MARKET`
// (e.g. `judydoll.com:US,jsmbeauty.sg:SG`). Empty = no merchant anywhere. This is a DEMO SCOPE,
// not an eligibility decision: the gateway's Reap lane and the backend rail stay authoritative
// (eligibility per market, Shopify row, single variant, the purchasability gate, Tier B verdict).
// A decline stops this selected route without an alternate checkout/store link.
// The optional hosted pilot profile is separate, default-off, and pins HTTPS origins
// plus exact source/product routes; see docs/reap-hosted-pilot.md.
import { normalizeBuyerMarket } from '@/lib/buyerMarket';

const TRUTHY = new Set(['1', 'true', 'on', 'yes']);

export function isTruthyFlag(raw: unknown): boolean {
  return typeof raw === 'string' && TRUTHY.has(raw.trim().toLowerCase());
}

/**
 * The client switch. `process.env.NEXT_PUBLIC_…` must be spelled out literally for Next to inline it
 * into the client bundle, so it is read here and nowhere else.
 */
export function isReapCheckoutDemoClientEnabled(): boolean {
  return isTruthyFlag(process.env.NEXT_PUBLIC_REAP_CHECKOUT_DEMO);
}

export const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Exact, owned HTTPS origins only: no credentials, path, port, query or redirect target. */
function pinnedHttpsOrigin(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const text = raw.trim().replace(/\/$/, '');
    const url = new URL(text);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.origin !== text
      || !url.hostname.endsWith('.pivota.cc') || !/^[a-z0-9.-]+$/.test(url.hostname)) return null;
    return url.origin;
  } catch { return null; }
}
export function reapCheckoutProfile(env: NodeJS.ProcessEnv = process.env): string {
  return String(env.REAP_CHECKOUT_PROFILE || 'demo').trim();
}
export function readPilotOrigins(env: NodeJS.ProcessEnv = process.env): { publicOrigin: string; gatewayOrigin: string } | null {
  const publicOrigin = pinnedHttpsOrigin(env.REAP_CHECKOUT_PILOT_ORIGIN);
  const gatewayOrigin = pinnedHttpsOrigin(env.REAP_CHECKOUT_PILOT_GATEWAY_ORIGIN);
  const base = String(env.REAP_CHECKOUT_GATEWAY_BASE_URL || '').trim().replace(/\/$/, '');
  return publicOrigin && gatewayOrigin && base === gatewayOrigin ? { publicOrigin, gatewayOrigin } : null;
}
/** The deployed pilot is separate from the loopback demo and always defaults off. */
export function reapDemoArmingProblem(env: NodeJS.ProcessEnv = process.env): string | null {
  const profile = reapCheckoutProfile(env);
  if (profile === 'pilot') {
    if (!isTruthyFlag(env.REAP_CHECKOUT_PILOT_ENABLED)) return 'pilot_disabled';
    if (!readPilotOrigins(env)) return 'pilot_origins_invalid';
    if (!readPilotRoutes(env).length) return 'pilot_routes_invalid';
    return null;
  }
  if (profile !== 'demo') return 'profile_invalid';
  if (env.NODE_ENV === 'production') return 'production_build';
  const raw = String(env.REAP_CHECKOUT_GATEWAY_BASE_URL || '').trim();
  if (!raw) return 'gateway_base_missing';
  let url: URL;
  try { url = new URL(raw); } catch { return 'gateway_base_invalid'; }
  if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) return 'gateway_base_not_loopback';
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'gateway_base_invalid';
  return null;
}
export function isReapCheckoutDemoServerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const selected = reapCheckoutProfile(env) === 'pilot' ? env.REAP_CHECKOUT_PILOT_ENABLED : env.REAP_CHECKOUT_DEMO_ENABLED;
  return isTruthyFlag(selected) && isTruthyFlag(env.NEXT_PUBLIC_REAP_CHECKOUT_DEMO) && reapDemoArmingProblem(env) === null;
}

/** Lower case, one leading `www.` removed — the backend's own canonical merchant-domain spelling. */
export function canonicalMerchantDomain(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const host = raw.trim().toLowerCase().replace(/\.$/, '');
  if (!host || !/^[a-z0-9.-]+$/.test(host) || !host.includes('.')) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  return host.replace(/^www\./, '');
}

export type ReapItemSource = "reap_variant" | "cart_link";
export type DemoMerchant = { domain: string; market: string; itemSource?: ReapItemSource; productIds?: string[] };
/** Server-side only: optionally, the Pivota catalog merchant id(s) accepted as the seller. */
export type DemoMerchantConfig = DemoMerchant & { merchantIds: string[] };

const MERCHANT_ID_RE = /^[A-Za-z0-9_.-]{1,80}$/;

/**
 * REAP_CHECKOUT_DEMO_MERCHANTS: comma list of `domain:MARKET[:merchant_id[|merchant_id…]]`, e.g.
 * `judydoll.com:US` or `judydoll.com:US:merch_abc`. The domain is what the create sends as
 * `checkout.reap.expected_merchant_domain` (the gateway refuses any other seller) and what the published
 * `reap.merchant_domain` must fold to. The merchant id is OPTIONAL: when configured AND the gateway
 * publishes `reap.merchant_id`, they must agree; the gateway omits the id for the shared external-seed
 * placeholder, so it is never required.
 */
export function readDemoMerchantConfig(env: NodeJS.ProcessEnv = process.env): DemoMerchantConfig[] {
  if (reapCheckoutProfile(env) === 'pilot') return readPilotRoutes(env);
  const raw = String(env.REAP_CHECKOUT_DEMO_MERCHANTS || '').trim();
  if (!raw) return [];
  const out: DemoMerchantConfig[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const [d, m, ids] = part.split(':');
    const domain = canonicalMerchantDomain(d);
    const market = normalizeBuyerMarket(m);
    const rawIds = String(ids || '').split('|').map((x) => x.trim()).filter(Boolean);
    const merchantIds = rawIds.filter((x) => MERCHANT_ID_RE.test(x));
    // A malformed id list is a config error: drop the entry rather than silently widening it.
    if (!domain || !market || merchantIds.length !== rawIds.length || seen.has(domain)) continue;
    seen.add(domain);
    out.push({ domain, market, merchantIds });
  }
  return out;
}

/** Public entry scope: merchant/market plus the pilot's explicit source/product list; no credentials. */
export function readDemoMerchants(env: NodeJS.ProcessEnv = process.env): DemoMerchant[] {
  return readDemoMerchantConfig(env).map(({ domain, market, itemSource, productIds }) => ({ domain, market, ...(itemSource ? { itemSource } : {}), ...(productIds ? { productIds } : {}) }));
}

/** The merchant's storefront host from a URL (the PDP's external redirect URL), canonicalised. */
export function merchantDomainFromUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return canonicalMerchantDomain(url.hostname);
  } catch {
    return null;
  }
}

/** The terms the buyer is shown and accepts (the gateway's own terms-of-service link). */
export function reapTermsUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = String(env.REAP_CHECKOUT_TERMS_URL || '').trim();
  return /^https:\/\/[^\s]+$/.test(raw) ? raw : 'https://pivota.cc/terms';
}

/** The tag of the terms the buyer accepts in the demo form. ≤ 32 printable characters. */
export function reapConsentVersion(env: NodeJS.ProcessEnv = process.env): string {
  const raw = String(env.REAP_CHECKOUT_CONSENT_VERSION || '').trim();
  return raw && raw.length <= 32 && /^[\x21-\x7e]+$/.test(raw) ? raw : 'reap-agentic-v1';
}

/** Explicit pilot routes only. A malformed entry refuses the entire profile. */
export function readPilotRoutes(env: NodeJS.ProcessEnv = process.env): DemoMerchantConfig[] {
  const raw = String(env.REAP_CHECKOUT_PILOT_ROUTES || '');
  if (!raw || raw.length > 8192) return [];
  let entries: unknown;
  try { entries = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 20) return [];
  const result: DemoMerchantConfig[] = [], seen = new Set<string>();
  for (const row of entries) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
      || Object.keys(row).some((key) => !['domain', 'market', 'item_source', 'product_ids', 'merchant_ids'].includes(key))) return [];
    const domain = canonicalMerchantDomain(row.domain), market = normalizeBuyerMarket(row.market);
    const source = row.item_source;
    const products = row.product_ids, ids = row.merchant_ids ?? [];
    if (!domain || !market || !['reap_variant', 'cart_link'].includes(source) || seen.has(domain)
      || !Array.isArray(products) || !products.length || products.length > 20
      || products.some((id: unknown) => typeof id !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(id))
      || new Set(products).size !== products.length || !Array.isArray(ids)
      || ids.some((id: unknown) => typeof id !== 'string' || !MERCHANT_ID_RE.test(id))) return [];
    seen.add(domain);
    result.push({ domain, market, merchantIds: ids, itemSource: source, productIds: products });
  }
  return result;
}
